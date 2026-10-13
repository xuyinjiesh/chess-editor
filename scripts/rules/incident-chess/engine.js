// Ported from xuyinjie's chess-room; see docs/INCIDENT_CHESS.md.
function posEq(a, b) {
    return a.x === b.x && a.y === b.y;
}
function isPos(v) {
    return (typeof v === "object" &&
        v !== null &&
        typeof v.x === "number" &&
        typeof v.y === "number");
}
function shuffle(arr, state) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        // Keep the random stream in snapshots: hints/search/undo never reroll it.
        state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
        const j = Math.floor(state.seed / 4294967296 * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
/** 火器制造：原型经过多少回合（每名玩家行动一次 +1）后升级成正式棋子 */
const PROTOTYPE_CANNON_TURNS = 3;
const PROTOTYPE_CHARIOT_TURNS = 9;
/** 良驹难寻系列：技能 -> 良驹被马踩上后升级成的名驹 */
const STEED_KIND = {
    "良驹难寻·赤兔": "赤兔",
    "良驹难寻·的卢": "的卢",
    "良驹难寻·白鹤": "白鹤",
    "良驹难寻·绝影": "绝影",
};
class ChineseChessEngine {
    initState(players) {
        return new IncidentChessState(players);
    }
    handleMove(state, playerId, action) {
        if (state.status.kind !== "playing") {
            return { success: false, error: "game is not in progress" };
        }
        switch (action.kind) {
            case "move":
                return this.handleMovePiece(state, playerId, action);
            case "choose-skill":
                return this.handleChooseSkill(state, playerId, action);
            case "apply-skill":
                return this.handleApplySkill(state, playerId, action);
            case "use-trick":
                return this.handleUseTrick(state, playerId, action);
            case "place-general":
                return this.handlePlaceGeneral(state, playerId, action);
            case "end-turn":
                return this.handleEndTurn(state, playerId);
            case "place-puppet":
                return this.handlePlacePuppet(state, playerId, action);
            default:
                return { success: false, error: "unknown action" };
        }
    }
    /** 隐藏信息投影：幻/虚棋子对对方隐藏真身（对方视角显示伪装的真子） */
    viewFor(state, viewerId) {
        const clone = this.cloneStateForView(state);
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 9; x++) {
                const p = clone.boardState[y][x];
                if (!p)
                    continue;
                if ((p.kind === "幻·兵" || p.kind === "幻·马" || p.kind === "虚·初始棋子") &&
                    p.owner !== viewerId) {
                    p.kind = p.mimicKind ?? "兵";
                }
            }
        }
        return clone;
    }
    cloneStateForView(state) {
        const clone = Object.assign(Object.create(IncidentChessState.prototype), state);
        clone.boardState = state.boardState.map((row) => row.map((cell) => (cell ? this.clonePieceForView(cell) : null)));
        clone.playerToPieceColor = { ...state.playerToPieceColor };
        clone.status = { ...state.status };
        clone.tricks = {};
        clone.persistents = {};
        clone.resurrect = {};
        clone.doubleMovePos = {};
        clone.phantomSideArmed = {};
        for (const p of state.players) {
            clone.tricks[p] = [...(state.tricks[p] ?? [])];
            clone.persistents[p] = [...(state.persistents[p] ?? [])];
            clone.resurrect[p] = state.resurrect[p] ? { ...state.resurrect[p] } : null;
            clone.doubleMovePos[p] = state.doubleMovePos[p] ? { ...state.doubleMovePos[p] } : null;
            clone.phantomSideArmed[p] = !!state.phantomSideArmed[p];
        }
        clone.offer = state.offer
            ? { playerId: state.offer.playerId, options: [...state.offer.options] }
            : null;
        clone.pendingSkill = state.pendingSkill
            ? { playerId: state.pendingSkill.playerId, skill: state.pendingSkill.skill }
            : null;
        clone.awaitingResurrect = state.awaitingResurrect;
        clone.pendingSecondMove = state.pendingSecondMove ? { ...state.pendingSecondMove } : null;
        return clone;
    }
    clonePieceForView(p) {
        const np = new IncidentChessPiece(p.owner, { x: p.pos.x, y: p.pos.y }, p.color, p.kind, p.mimicKind, p.expiry, p.armored, p.upgradeAt, p.steedKind);
        return np;
    }
    turnOf(state, playerId) {
        if (state.status.kind !== "playing")
            return false;
        return state.players[state.status.turn] === playerId;
    }
    handleMovePiece(state, playerId, action) {
        if (!this.turnOf(state, playerId)) {
            return { success: false, error: "not your turn" };
        }
        if (state.offer || state.pendingSkill) {
            return { success: false, error: "choose a skill first" };
        }
        if (state.awaitingResurrect === playerId) {
            return { success: false, error: "must resurrect your general" };
        }
        const { from, to } = action;
        if (!isPos(from) || !isPos(to)) {
            return { success: false, error: "bad position" };
        }
        if (state.pendingSecondMove) {
            if (!posEq(from, state.pendingSecondMove)) {
                return { success: false, error: "move the selected pawn again" };
            }
        }
        const piece = state.boardState[from.y]?.[from.x];
        if (!piece) {
            return { success: false, error: "no piece at origin" };
        }
        if (piece.owner !== playerId) {
            return { success: false, error: "not your piece" };
        }
        const hints = hintMove(piece, state);
        if (!hints.some((h) => posEq({ x: h.x, y: h.y }, to))) {
            return { success: false, error: "illegal move" };
        }
        const result = this.applyMove(state, playerId, piece, from, to, !state.pendingSecondMove);
        if (result === "won")
            return { success: true };
        if (result === "second")
            return { success: true };
        this.startOffer(state, playerId);
        return { success: true };
    }
    applyMove(state, playerId, piece, from, to, allowDouble) {
        const kingPositions = Object.fromEntries(state.players.map(owner => [owner,state.boardState.flat().find(p => p && p.owner === owner && ['将','骠骑将军'].includes(p.kind))?.pos]));
        const captured = state.boardState[to.y][to.x];
        // 护甲：被吃时护甲破碎，吃子失败（攻击方留在原位）
        if (captured && captured.owner !== playerId && captured.armored) {
            captured.armored = false;
            state.pendingSecondMove = null;
            return "blocked";
        }
        // 装甲：可被吃掉，吃子者获得护甲
        if (captured && captured.kind === "装甲") {
            piece.armored = true;
        }
        if (['将','骠骑将军'].includes(piece.kind)) kingPositions[playerId]={...to};
        state.boardState[from.y][from.x] = null;
        if (captured && captured.kind === "地雷") {
            state.boardState[to.y][to.x] = null;
            state.pendingSecondMove = null;
            return this.resolveKings(state, kingPositions) ? 'won' : 'done';
        }
        if (!this.maybeMerge(state, piece, to)) {
            state.boardState[to.y][to.x] = piece;
            piece.pos = { x: to.x, y: to.y };
        }
        // Promotions and extra actions belong to the resulting merged piece.
        const movingId = piece._id, armored = piece.armored;
        piece = state.boardState[to.y][to.x];
        piece._id = movingId;
        piece.armored ||= armored;
        if (captured && captured.owner !== playerId && captured.kind === "军长") {
            this.decomposeOnCapture(state, captured, to);
        }
        this.maybePromote(state, piece);
        if (captured && captured.owner !== playerId) {
            this.maybeBattlePromote(state, piece, captured);
        }
        this.maybeFollow(state, piece, from, to);
        this.maybeImpact(state, piece, from, to);
        this.maybeFireShot(state, piece, from, to, captured);
        this.maybePuppetResolve(state, piece, from, to, captured);
        this.maybeSteedPhantoms(state, piece);
        if (state.phantomSideArmed[playerId] && piece.kind === "兵" && from.x !== to.x) {
            this.spawnSidePhantom(state, playerId, piece, from, to);
        }
        if (this.resolveKings(state, kingPositions)) return 'won';
        if (state.players.some(owner => state.resurrect[owner])) {state.pendingSecondMove=null;return 'done';}
        if (allowDouble && state.boardState[to.y][to.x] === piece && this.pieceHasDoubleMove(state, piece, from)) {
            if (piece.kind === "兵")
                state.doubleMovePos[playerId] = null;
            state.pendingSecondMove = { x: to.x, y: to.y };
            return "second";
        }
        state.pendingSecondMove = null;
        return "done";
    }
    resolveKings(state, previousPositions) {
        const missing = owner => !state.boardState.flat().some(p => p && p.owner === owner && ['将','骠骑将军'].includes(p.kind));
        for (const owner of state.players) {
            if (!missing(owner) || state.resurrect[owner]) continue;
            if (this.hasTrick(state,owner,'金蝉脱壳') && previousPositions[owner]) {
                this.consumeTrick(state,owner,'金蝉脱壳');
                state.resurrect[owner]={...previousPositions[owner]};
                state.awaitingResurrect=owner;
            } else if (this.hasPersistent(state,owner,'将魂犹在') && this.elephantToGeneral(state,owner)) {
                this.removePersistent(state,owner,'将魂犹在');
            }
        }
        const lost=state.players.filter(owner=>missing(owner) && !state.resurrect[owner]);
        if (!lost.length) return false;
        // Author-confirmed: simultaneous elimination after survival effects is a draw.
        state.status=lost.length === 2 ? {kind:'draw'} : {kind:'won',winner:state.players.find(owner=>owner !== lost[0])};
        state.pendingSecondMove=null;
        return true;
    }
    maybePromote(state, piece) {
        if (piece.kind !== "兵")
            return;
        if (!this.hasPersistent(state, piece.owner, "兵的升变"))
            return;
        if (!isOnOpponentBaseline(piece.color, piece.pos.y))
            return;
        piece.kind = "后";
    }
    pieceHasDoubleMove(state, piece, from) {
        if (piece.kind === "兵") {
            const dm = state.doubleMovePos[piece.owner];
            return !!dm && posEq(dm, from);
        }
        if (piece.kind === "将") {
            return this.hasPersistent(state, piece.owner, "破釜沉舟");
        }
        if (piece.kind === "骠骑将军")
            return true;
        const idx = RANK_INDEX[piece.kind];
        if (idx !== undefined && idx >= 5)
            return true;
        return false;
    }
    maybeBattlePromote(state, piece, captured) {
        if (RANK_INDEX[piece.kind] === undefined)
            return;
        const hasV2 = this.hasPersistent(state, piece.owner, "战功晋升II");
        const hasV1 = this.hasPersistent(state, piece.owner, "战功晋升");
        if (!hasV1 && !hasV2)
            return;
        if (hasV2 && captured && captured.kind !== "兵") {
            let next = NEXT_RANK[piece.kind];
            if (next)
                piece.kind = next;
            next = NEXT_RANK[piece.kind];
            if (next)
                piece.kind = next;
            return;
        }
        if (hasV1) {
            const next = NEXT_RANK[piece.kind];
            if (next)
                piece.kind = next;
        }
    }
    decomposeOnCapture(state, captured, to) {
        this.spawnLower(state, captured.owner, captured.color, "旅长", to);
    }
    spawnLower(state, owner, color, kind, center) {
        for (const [dx, dy] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
        ]) {
            const nx = center.x + dx;
            const ny = center.y + dy;
            if (nx < 0 || nx > 8 || ny < 0 || ny > 9)
                continue;
            const c = state.boardState[ny][nx];
            if (c && c.kind !== "虚·初始棋子")
                continue;
            state.boardState[ny][nx] = new IncidentChessPiece(owner, { x: nx, y: ny }, color, kind);
        }
    }
    /** 声东击西：兵左右移动后，在反方向镜像格生成幻·兵 */
    spawnSidePhantom(state, playerId, piece, from, to) {
        state.phantomSideArmed[playerId] = false;
        const sx = from.x - (to.x - from.x);
        const sy = from.y;
        if (sx < 0 || sx > 8 || sy < 0 || sy > 9)
            return;
        if (state.boardState[sy][sx])
            return;
        state.boardState[sy][sx] = new IncidentChessPiece(playerId, { x: sx, y: sy }, piece.color, "幻·兵", "兵", state.round + 1);
    }
    /** 绝影：移动后在落点周围生成两个幻·马（对手视角视为真马，下一回合消失） */
    maybeSteedPhantoms(state, piece) {
        if (piece.kind !== "绝影")
            return;
        const color = state.playerToPieceColor[piece.owner];
        const slots = [];
        for (const [dx, dy] of [
            [-1, -1],
            [-1, 0],
            [-1, 1],
            [0, -1],
            [0, 1],
            [1, -1],
            [1, 0],
            [1, 1],
        ]) {
            const nx = piece.pos.x + dx;
            const ny = piece.pos.y + dy;
            if (nx < 0 || nx > 8 || ny < 0 || ny > 9)
                continue;
            if (!state.boardState[ny][nx])
                slots.push({ x: nx, y: ny });
        }
        for (const pos of shuffle(slots, state).slice(0, 2)) {
            state.boardState[pos.y][pos.x] = new IncidentChessPiece(piece.owner, { x: pos.x, y: pos.y }, color, "幻·马", "马", state.round + 1);
        }
    }
    /** 生成真子时空格可放；虚·初始棋子可被真子覆盖（可真子覆盖） */
    slotFreeForSpawn(state, pos) {
        const c = state.boardState[pos.y]?.[pos.x];
        if (!c)
            return true;
        return c.kind === "虚·初始棋子";
    }
    /** 清理己方过期的幻·兵/幻·马（己方下一回合开始时消失，虚·初始棋子永续） */
    clearExpiredPhantoms(state, playerId) {
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 9; x++) {
                const p = state.boardState[y][x];
                if (!p || (p.kind !== "幻·兵" && p.kind !== "幻·马") || p.owner !== playerId)
                    continue;
                if (p.expiry !== undefined && p.expiry <= state.round) {
                    state.boardState[y][x] = null;
                }
            }
        }
    }
    /** 原型·炮/车·原型 到期后升级成正式棋子（炮3回合、车9回合） */
    processPrototypeUpgrades(state) {
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 9; x++) {
                const p = state.boardState[y][x];
                if (!p || p.upgradeAt === undefined || p.upgradeAt > state.round)
                    continue;
                if (p.kind === "原型·炮")
                    p.kind = "炮";
                else if (p.kind === "车·原型")
                    p.kind = "车";
                delete p.upgradeAt;
            }
        }
    }
    maybeFollow(state, piece, from, to) {
        if (piece.kind !== "师长")
            return;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        if (dx === 0 && dy === 0)
            return;
        for (const [nxo, nyo] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
        ]) {
            const nx = to.x + nxo;
            const ny = to.y + nyo;
            if (nx < 0 || nx > 8 || ny < 0 || ny > 9)
                continue;
            const c = state.boardState[ny][nx];
            if (!c || c.owner !== piece.owner)
                continue;
            const idx = RANK_INDEX[c.kind];
            if (idx === undefined || idx >= RANK_INDEX["师长"])
                continue;
            const tx = nx + dx;
            const ty = ny + dy;
            if (tx < 0 || tx > 8 || ty < 0 || ty > 9)
                continue;
            const tc = state.boardState[ty][tx];
            if (tc && (tc.owner === piece.owner || tc.kind === '掩体'))
                continue;
            if (tc?.armored) {tc.armored=false;continue;}
            state.boardState[ny][nx] = null;
            if (tc?.kind === '地雷') {state.boardState[ty][tx]=null;continue;}
            if (tc?.kind === '装甲') c.armored=true;
            c.pos = { x: tx, y: ty };
            state.boardState[ty][tx] = c;
        }
    }
    maybeImpact(state, piece, from, to) {
        if (piece.kind !== "冲击车")
            return;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.abs(dx) + Math.abs(dy);
        if (dist < 2)
            return;
        const dirx = Math.sign(dx);
        const diry = Math.sign(dy);
        const ix = to.x + dirx;
        const iy = to.y + diry;
        if (ix < 0 || ix > 8 || iy < 0 || iy > 9)
            return;
        const target = state.boardState[iy][ix];
        if (!target || target.owner === piece.owner || target.kind === "掩体" || target.kind === "装甲")
            return;
        if (target.armored) {target.armored=false;return;}
        if (target.kind === "地雷") {
            state.boardState[iy][ix] = null;
            state.boardState[to.y][to.x] = null;
            return;
        }
        state.boardState[iy][ix] = null;
    }
    maybeFireShot(state, piece, from, to, captured) {
        if (!captured || captured.owner === piece.owner)
            return;
        const cannonKinds = [
            "炮",
            "迷你炮",
            "直角炮",
            "士角炮",
            "空响炮",
        ];
        if (!cannonKinds.includes(piece.kind))
            return;
        const screen = this.fireScreen(state, from, to, piece.kind);
        if (!screen || screen.kind !== "火铳")
            return;
        state.boardState[screen.pos.y][screen.pos.x] = null;
        for (const [dx, dy] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
        ]) {
            const nx = to.x + dx;
            const ny = to.y + dy;
            if (nx < 0 || nx > 8 || ny < 0 || ny > 9)
                continue;
            const c = state.boardState[ny][nx];
            if (!c || c.kind === "掩体")
                continue;
            if (c.armored) c.armored=false;
            else state.boardState[ny][nx] = null;
        }
        if (piece.armored) piece.armored=false;
        else state.boardState[to.y][to.x] = null;
    }
    fireScreen(state, from, to, kind) {
        if (kind === '直角炮' || kind === '士角炮') {
            // Follow the same two-segment route used to generate corner captures.
            for (const [dx,dy] of ORTHOGONAL_DIRS) {
                let x=from.x+dx,y=from.y+dy;
                while (checkPosInBoard(state,{x,y}) && !state.boardState[y][x]) {x+=dx;y+=dy;}
                if (!checkPosInBoard(state,{x,y}) || state.boardState[y][x]?.kind !== '火铳') continue;
                const screen=state.boardState[y][x];
                const dirs=kind === '直角炮' ? [[-dy,dx],[dy,-dx]] : DIAGONAL_DIRS;
                for (const [sx,sy] of dirs) {
                    let tx=x+sx,ty=y+sy;
                    while (checkPosInBoard(state,{x:tx,y:ty})) {
                        if (tx === to.x && ty === to.y) return screen;
                        if (state.boardState[ty][tx]) break;
                        tx+=sx;ty+=sy;
                    }
                }
            }
            return null;
        }
        const dx = Math.sign(to.x - from.x);
        const dy = Math.sign(to.y - from.y);
        if (Math.abs(dx) + Math.abs(dy) !== 1)
            return null;
        let nx = from.x + dx;
        let ny = from.y + dy;
        while (nx !== to.x || ny !== to.y) {
            if (!(nx >= 0 && nx <= 8 && ny >= 0 && ny <= 9))
                return null;
            const c = state.boardState[ny][nx];
            if (c)
                return c;
            nx += dx;
            ny += dy;
        }
        return null;
    }
    maybePuppetResolve(state, piece, _from, to, captured) {
        if (piece.kind === "傀儡·兵" || piece.kind === "皮影·猴") {
            if (!inPuppetRange(state, piece.owner, to)) {
                state.boardState[to.y][to.x] = null;
                return;
            }
            if (piece.kind === "皮影·猴") {
                this.terrify(state, piece, to);
            }
        }
        if (captured &&
            captured.owner !== piece.owner &&
            captured.kind !== "将" &&
            captured.kind !== "骠骑将军" &&
            this.hasPersistent(state, piece.owner, "傀儡术·炼尸") &&
            inPuppetRange(state, piece.owner, to)) {
            this.resurrectById(state, captured, piece.owner);
        }
    }
    terrify(state, piece, to) {
        for (const [dx, dy] of [
            [-1, -1],
            [-1, 0],
            [-1, 1],
            [0, -1],
            [0, 1],
            [1, -1],
            [1, 0],
            [1, 1],
        ]) {
            const nx = to.x + dx;
            const ny = to.y + dy;
            if (nx < 0 || nx > 8 || ny < 0 || ny > 9)
                continue;
            const c = state.boardState[ny][nx];
            if (!c || c.owner === piece.owner || c.kind === "掩体")
                continue;
            const px = nx + Math.sign(dx);
            const py = ny + Math.sign(dy);
            if (px < 0 || px > 8 || py < 0 || py > 9)
                continue;
            if (state.boardState[py][px])
                continue;
            state.boardState[ny][nx] = null;
            c.pos = { x: px, y: py };
            state.boardState[py][px] = c;
        }
    }
    resurrectById(state, captured, owner) {
        const yan = findYanShi(state, owner);
        if (!yan)
            return;
        for (const [dx, dy] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
            [-1, -1],
            [-1, 1],
            [1, -1],
            [1, 1],
        ]) {
            const nx = yan.x + dx;
            const ny = yan.y + dy;
            if (nx < 0 || nx > 8 || ny < 0 || ny > 9)
                continue;
            if (state.boardState[ny][nx])
                continue;
            const color = state.playerToPieceColor[owner];
            state.boardState[ny][nx] = new IncidentChessPiece(owner, { x: nx, y: ny }, color, captured.kind);
            return;
        }
    }
    elephantToGeneral(state, owner) {
        for (let y = 0; y < 10; y++)
            for (let x = 0; x < 9; x++) {
                const p = state.boardState[y][x];
                if (p && p.owner === owner && p.kind === "相") {
                    p.kind = "将";
                    return true;
                }
            }
        return false;
    }
    maybeMerge(state, piece, to) {
        const destPiece = state.boardState[to.y][to.x];
        if (!destPiece || destPiece.owner !== piece.owner)
            return false;
        // 良驹难寻：马踩上良驹，升级为对应名驹
        if (destPiece.kind === "良驹" && piece.kind === "马" && destPiece.steedKind) {
            const steed = new IncidentChessPiece(piece.owner, { x: to.x, y: to.y }, piece.color, destPiece.steedKind);
            state.boardState[to.y][to.x] = steed;
            return true;
        }
        if (destPiece.kind === "炮台") {
            let target = null;
            if (piece.kind === "直角炮")
                target = "直角炮台";
            else if (piece.kind === "士角炮")
                target = "士角炮台";
            if (target) {
                const turret = new IncidentChessPiece(piece.owner, { x: to.x, y: to.y }, piece.color, target);
                state.boardState[to.y][to.x] = turret;
                return true;
            }
        }
        if (this.hasPersistent(state, piece.owner, "猛犸象")) {
            const horseToEleph = piece.kind === "马" && destPiece.kind === "相";
            const elephToHorse = piece.kind === "相" && destPiece.kind === "马";
            if (horseToEleph || elephToHorse) {
                const mammoth = new IncidentChessPiece(piece.owner, { x: to.x, y: to.y }, piece.color, "猛犸象");
                state.boardState[to.y][to.x] = mammoth;
                return true;
            }
        }
        if (this.hasPersistent(state, piece.owner, "骠骑将军")) {
            const genToHorse = piece.kind === "将" && destPiece.kind === "马";
            const horseToGen = piece.kind === "马" && destPiece.kind === "将";
            if (genToHorse || horseToGen) {
                const cavalry = new IncidentChessPiece(piece.owner, { x: to.x, y: to.y }, piece.color, "骠骑将军");
                state.boardState[to.y][to.x] = cavalry;
                return true;
            }
        }
        if (this.hasPersistent(state, piece.owner, "龙骑兵")) {
            const horseToPawn = piece.kind === "马" && destPiece.kind === "兵";
            const pawnToHorse = piece.kind === "兵" && destPiece.kind === "马";
            if (horseToPawn || pawnToHorse) {
                const cavalry = new IncidentChessPiece(piece.owner, { x: to.x, y: to.y }, piece.color, "龙骑兵");
                state.boardState[to.y][to.x] = cavalry;
                return true;
            }
        }
        const unlock = this.hasPersistent(state, piece.owner, "化零为整");
        if (unlock &&
            destPiece.kind === piece.kind &&
            RANK_INDEX[piece.kind] !== undefined) {
            const next = NEXT_RANK[piece.kind];
            if (next) {
                const promoted = new IncidentChessPiece(piece.owner, { x: to.x, y: to.y }, piece.color, next);
                state.boardState[to.y][to.x] = promoted;
                return true;
            }
        }
        return false;
    }
    handleChooseSkill(state, playerId, action) {
        if (!state.offer || state.offer.playerId !== playerId) {
            return { success: false, error: "no skill offer for you" };
        }
        if (!state.offer.options.includes(action.skill)) {
            return { success: false, error: "skill not offered" };
        }
        const skill = action.skill;
        state.offer = null;
        const type = SKILL_TYPES[skill];
        if (type === "trick") {
            this.addTrick(state, playerId, skill);
            this.endSkillPhase(state, playerId);
            return { success: true };
        }
        if (type === "persistent") {
            this.addPersistent(state, playerId, skill);
            this.endSkillPhase(state, playerId);
            return { success: true };
        }
        if (STEED_SKILLS.includes(skill)) {
            // 良驹难寻：立即在我方随机空格生成良驹（前置：有我方马）
            const steedKind = STEED_KIND[skill];
            if (steedKind)
                this.spawnSteedToken(state, playerId, steedKind);
            this.endSkillPhase(state, playerId);
            return { success: true };
        }
        state.pendingSkill = { playerId, skill };
        return { success: true, extra: "pick-target" };
    }
    /** 良驹难寻：在我方后三行随机空格生成一匹良驹（记录升级目标名驹） */
    spawnSteedToken(state, playerId, steedKind) {
        const slots = emptyBackRows(state, playerId);
        const pos = shuffle(slots, state)[0];
        if (!pos)
            return;
        const color = state.playerToPieceColor[playerId];
        state.boardState[pos.y][pos.x] = new IncidentChessPiece(playerId, { x: pos.x, y: pos.y }, color, "良驹", undefined, undefined, false, undefined, steedKind);
    }
    handleApplySkill(state, playerId, action) {
        if (!state.pendingSkill || state.pendingSkill.playerId !== playerId) {
            return { success: false, error: "no pending skill" };
        }
        if (state.pendingSkill.skill !== action.skill) {
            return { success: false, error: "skill mismatch" };
        }
        const { skill, from, to } = action;
        if (!isPos(from) || !isPos(to)) {
            return { success: false, error: "bad position" };
        }
        state.pendingSkill = null;
        let result = "done";
        switch (skill) {
            case "快马加鞭": {
                const p = state.boardState[from.y]?.[from.x];
                if (!p || p.owner !== playerId || p.kind !== "马" || !isOnBaseline(p.color, from.y)) {
                    this.endSkillPhase(state, playerId);
                    return { success: true, extra: "no-op" };
                }
                const hints = hintMove(p, state);
                if (!hints.some((h) => posEq({ x: h.x, y: h.y }, to))) {
                    this.endSkillPhase(state, playerId);
                    return { success: true, extra: "no-op" };
                }
                result = this.applyMove(state, playerId, p, from, to, false);
                break;
            }
            case "仙人指路": {
                const p = state.boardState[from.y]?.[from.x];
                if (!p || p.owner !== playerId || p.kind !== "兵" || !isOnPawnLine(p.color, from.y)) {
                    this.endSkillPhase(state, playerId);
                    return { success: true, extra: "no-op" };
                }
                const hints = hintMove(p, state);
                if (!hints.some((h) => posEq({ x: h.x, y: h.y }, to))) {
                    this.endSkillPhase(state, playerId);
                    return { success: true, extra: "no-op" };
                }
                result = this.applyMove(state, playerId, p, from, to, false);
                break;
            }
            case "运筹帷幄": {
                const p = state.boardState[from.y]?.[from.x];
                if (!p || p.owner !== playerId || p.kind !== "相" || !isOnBaseline(p.color, from.y)) {
                    this.endSkillPhase(state, playerId);
                    return { success: true, extra: "no-op" };
                }
                const hints = hintMove(p, state);
                if (!hints.some((h) => posEq({ x: h.x, y: h.y }, to))) {
                    this.endSkillPhase(state, playerId);
                    return { success: true, extra: "no-op" };
                }
                result = this.applyMove(state, playerId, p, from, to, false);
                break;
            }
            case "衷心护主": {
                const p = state.boardState[from.y]?.[from.x];
                if (!p || p.owner !== playerId || p.kind !== "士" || !isOnBaseline(p.color, from.y)) {
                    this.endSkillPhase(state, playerId);
                    return { success: true, extra: "no-op" };
                }
                const hints = hintMove(p, state);
                if (!hints.some((h) => posEq({ x: h.x, y: h.y }, to))) {
                    this.endSkillPhase(state, playerId);
                    return { success: true, extra: "no-op" };
                }
                result = this.applyMove(state, playerId, p, from, to, false);
                break;
            }
            case "迷你炮": {
                const p = state.boardState[from.y]?.[from.x];
                if (p && p.owner === playerId && p.kind === "炮") {
                    p.kind = "迷你炮";
                }
                break;
            }
            case "空响炮": {
                const p = state.boardState[from.y]?.[from.x];
                if (p && p.owner === playerId && p.kind === "炮") {
                    p.kind = "空响炮";
                }
                break;
            }
            case "直角炮": {
                const p = state.boardState[from.y]?.[from.x];
                if (p && p.owner === playerId && p.kind === "炮") {
                    p.kind = "直角炮";
                }
                break;
            }
            case "士角炮": {
                const p = state.boardState[from.y]?.[from.x];
                if (p && p.owner === playerId && p.kind === "炮") {
                    p.kind = "士角炮";
                }
                break;
            }
            case "冲击车": {
                const p = state.boardState[from.y]?.[from.x];
                if (p && p.owner === playerId && p.kind === "车") {
                    p.kind = "冲击车";
                }
                break;
            }
            case "变形金刚·炮台": {
                const p = state.boardState[from.y]?.[from.x];
                if (p && p.owner === playerId && p.kind === "车") {
                    p.kind = "炮台";
                }
                break;
            }
            case "变形金刚·火铳": {
                const p = state.boardState[from.y]?.[from.x];
                if (p && p.owner === playerId && p.kind === "车") {
                    p.kind = "火铳";
                }
                break;
            }
            case "变形金刚·装甲": {
                const p = state.boardState[from.y]?.[from.x];
                if (p && p.owner === playerId && p.kind === "车") {
                    p.kind = "装甲";
                }
                break;
            }
            case "招贤纳士": {
                const color = state.playerToPieceColor[playerId];
                const y = color === "Red" ? 9 : 0;
                const kind = from.x === 3 || from.x === 5
                    ? "士"
                    : from.x === 2 || from.x === 6
                        ? "相"
                        : null;
                if (kind && from.y === y && this.slotFreeForSpawn(state, from)) {
                    state.boardState[from.y][from.x] = new IncidentChessPiece(playerId, { x: from.x, y: from.y }, color, kind);
                }
                break;
            }
            case "招兵买马": {
                const color = state.playerToPieceColor[playerId];
                const pawnY = color === "Red" ? 6 : 3;
                const horseY = color === "Red" ? 9 : 0;
                let kind = null;
                if (from.y === pawnY && [0, 2, 4, 6, 8].includes(from.x)) {
                    kind = "兵";
                }
                else if (from.y === horseY && (from.x === 1 || from.x === 7)) {
                    kind = "马";
                }
                if (kind && this.slotFreeForSpawn(state, from)) {
                    state.boardState[from.y][from.x] = new IncidentChessPiece(playerId, { x: from.x, y: from.y }, color, kind);
                }
                break;
            }
            case "火器制造·炮": {
                const color = state.playerToPieceColor[playerId];
                if (emptyCannonSlots(state, playerId).some((p) => p.x === from.x && p.y === from.y)) {
                    state.boardState[from.y][from.x] = new IncidentChessPiece(playerId, { x: from.x, y: from.y }, color, "原型·炮", undefined, undefined, false, state.round + PROTOTYPE_CANNON_TURNS);
                }
                break;
            }
            case "火器制造·车": {
                const color = state.playerToPieceColor[playerId];
                if (emptyChariotSlots(state, playerId).some((p) => p.x === from.x && p.y === from.y)) {
                    state.boardState[from.y][from.x] = new IncidentChessPiece(playerId, { x: from.x, y: from.y }, color, "车·原型", undefined, undefined, false, state.round + PROTOTYPE_CHARIOT_TURNS);
                }
                break;
            }
            case "江湖众生·偃师": {
                const color = state.playerToPieceColor[playerId];
                const isSlot = yanShiPlacementSlots(state, playerId).some((p) => p.x === from.x && p.y === from.y);
                if (isSlot && !findYanShi(state, playerId)) {
                    state.boardState[from.y][from.x] = new IncidentChessPiece(playerId, { x: from.x, y: from.y }, color, "偃师");
                }
                break;
            }
            case "基础设施·掩体":
            case "基础设施·地雷": {
                const color = state.playerToPieceColor[playerId];
                const inOwn = color === "Red" ? from.y >= 5 : from.y <= 4;
                if (inOwn && !state.boardState[from.y][from.x]) {
                    const kind = skill === "基础设施·掩体" ? "掩体" : "地雷";
                    state.boardState[from.y][from.x] = new IncidentChessPiece(playerId, { x: from.x, y: from.y }, color, kind);
                }
                break;
            }
            default:
                break;
        }
        if (result === "won")
            return { success: true };
        if (result === "second") {
            state.pendingSecondMove = null;
            this.endSkillPhase(state, playerId);
            return { success: true };
        }
        this.endSkillPhase(state, playerId);
        return { success: true };
    }
    handleUseTrick(state, playerId, action) {
        if (!this.turnOf(state, playerId)) {
            return { success: false, error: "not your turn" };
        }
        if (state.offer || state.pendingSkill || state.pendingSecondMove) {
            return { success: false, error: "cannot use trick now" };
        }
        if (state.awaitingResurrect === playerId) {
            return { success: false, error: "must resurrect your general" };
        }
        if (!this.hasTrick(state, playerId, action.skill)) {
            return { success: false, error: "you don't have this trick" };
        }
        const skill = action.skill;
        switch (skill) {
            case "瞒天过海": {
                const from = action.from;
                const to = action.to;
                if (!isPos(from) || !isPos(to)) {
                    return { success: false, error: "bad position" };
                }
                const p = state.boardState[from.y]?.[from.x];
                if (!p || p.owner !== playerId || p.kind !== "兵" || !isOnPawnLine(p.color, from.y)) {
                    return { success: false, error: "invalid pawn" };
                }
                const expected = acrossRiverPos(p.color, from.x);
                if (!posEq(to, expected)) {
                    return { success: false, error: "must move straight across the river" };
                }
                const target = state.boardState[to.y][to.x];
                if (target && (target.kind === '掩体' || target.owner === playerId && !['虚·初始棋子','装甲','地雷'].includes(target.kind))) {
                    return { success: false, error: "cannot capture own piece" };
                }
                const result = this.applyTrickMove(state, playerId, p, from, to);
                if (result === "won")
                    return { success: true };
                this.consumeTrick(state, playerId, skill);
                return { success: true };
            }
            case "以逸待劳": {
                const from = action.from;
                if (!isPos(from)) {
                    return { success: false, error: "bad position" };
                }
                const p = state.boardState[from.y]?.[from.x];
                if (!p || p.owner !== playerId || p.kind !== "兵") {
                    return { success: false, error: "invalid pawn" };
                }
                state.doubleMovePos[playerId] = { x: from.x, y: from.y };
                this.consumeTrick(state, playerId, skill);
                return { success: true };
            }
            case "金蝉脱壳":
                return { success: false, error: "被动技能，被将吃时自动触发" };
            case "化整为零": {
                const from = action.from;
                if (!isPos(from)) {
                    return { success: false, error: "bad position" };
                }
                const p = state.boardState[from.y]?.[from.x];
                if (!p || p.owner !== playerId) {
                    return { success: false, error: "invalid piece" };
                }
                const idx = RANK_INDEX[p.kind];
                if (idx === undefined || idx < 1) {
                    return { success: false, error: "不是晋升后的棋子" };
                }
                const center = { x: from.x, y: from.y };
                state.boardState[from.y][from.x] = null;
                const lowerIdx = Math.max(0, idx - 2);
                const lowerKind = RANK_ORDER[lowerIdx];
                this.spawnLower(state, playerId, p.color, lowerKind, center);
                this.consumeTrick(state, playerId, skill);
                return { success: true };
            }
            case "树上开花": {
                const from = action.from;
                if (!isPos(from)) {
                    return { success: false, error: "bad position" };
                }
                if (!emptyPawnSlots(state, playerId).some((p) => p.x === from.x && p.y === from.y)) {
                    return { success: false, error: "目标不是空兵线格" };
                }
                const color = state.playerToPieceColor[playerId];
                state.boardState[from.y][from.x] = new IncidentChessPiece(playerId, { x: from.x, y: from.y }, color, "幻·兵", "兵", state.round + 1);
                this.consumeTrick(state, playerId, skill);
                return { success: true };
            }
            case "无中生有": {
                const from = action.from;
                if (!isPos(from)) {
                    return { success: false, error: "bad position" };
                }
                if (!emptyInitialSlots(state, playerId).some((p) => p.x === from.x && p.y === from.y)) {
                    return { success: false, error: "目标不是空初始格" };
                }
                const color = state.playerToPieceColor[playerId];
                const mimic = initialKindAt(color, from.x, from.y) ?? "兵";
                state.boardState[from.y][from.x] = new IncidentChessPiece(playerId, { x: from.x, y: from.y }, color, "虚·初始棋子", mimic);
                this.consumeTrick(state, playerId, skill);
                return { success: true };
            }
            case "声东击西": {
                state.phantomSideArmed[playerId] = true;
                this.consumeTrick(state, playerId, skill);
                return { success: true };
            }
            default:
                return { success: false, error: "not a trick" };
        }
    }
    applyTrickMove(state, playerId, piece, from, to) {
        // A trick remains a free action, but must resolve mines, armor and king
        // survival exactly like a normal move. It never grants a second move.
        return this.applyMove(state, playerId, piece, from, to, false) === 'won' ? 'won' : 'offer';
    }
    handlePlaceGeneral(state, playerId, action) {
        if (!this.turnOf(state, playerId)) {
            return { success: false, error: "not your turn" };
        }
        if (state.awaitingResurrect !== playerId) {
            return { success: false, error: "nothing to resurrect" };
        }
        const captured = state.resurrect[playerId];
        if (!captured) {
            return { success: false, error: "nothing to resurrect" };
        }
        const to = action.to;
        if (!isPos(to)) {
            return { success: false, error: "bad position" };
        }
        const dx = Math.abs(to.x - captured.x);
        const dy = Math.abs(to.y - captured.y);
        if (dx + dy !== 1 || dx > 1 || dy > 1) {
            return { success: false, error: "must place adjacent to capture position" };
        }
        if (state.boardState[to.y][to.x]) {
            return { success: false, error: "target occupied" };
        }
        const color = state.playerToPieceColor[playerId];
        const gen = new IncidentChessPiece(playerId, { x: to.x, y: to.y }, color, "将");
        state.boardState[to.y][to.x] = gen;
        state.resurrect[playerId] = null;
        state.awaitingResurrect = null;
        this.startOffer(state, playerId);
        return { success: true };
    }
    handleEndTurn(state, playerId) {
        if (!this.turnOf(state, playerId)) {
            return { success: false, error: "not your turn" };
        }
        if (!state.pendingSecondMove) {
            return { success: false, error: "nothing to end" };
        }
        state.pendingSecondMove = null;
        this.startOffer(state, playerId);
        return { success: true };
    }
    handlePlacePuppet(state, playerId, action) {
        if (!this.turnOf(state, playerId)) {
            return { success: false, error: "not your turn" };
        }
        if (state.offer || state.pendingSkill || state.pendingSecondMove) {
            return { success: false, error: "cannot place puppet now" };
        }
        const to = action.to;
        if (!isPos(to)) {
            return { success: false, error: "bad position" };
        }
        if (!findYanShi(state, playerId)) {
            return { success: false, error: "need a 偃师" };
        }
        if (!this.hasPersistent(state, playerId, action.skill)) {
            return { success: false, error: "you don't have this skill" };
        }
        const kind = action.skill === "傀儡术·悬丝"
            ? "傀儡·兵"
            : action.skill === "傀儡术·皮影"
                ? "皮影·猴"
                : null;
        if (!kind) {
            return { success: false, error: "not a puppet skill" };
        }
        if (state.boardState[to.y][to.x]) {
            return { success: false, error: "target occupied" };
        }
        if (!inPuppetRange(state, playerId, to)) {
            return { success: false, error: "out of range" };
        }
        const color = state.playerToPieceColor[playerId];
        state.boardState[to.y][to.x] = new IncidentChessPiece(playerId, { x: to.x, y: to.y }, color, kind);
        return { success: true };
    }
    startOffer(state, playerId) {
        this.clearExpiredPhantoms(state, playerId);
        this.processPrototypeUpgrades(state);
        const ownedPersistents = state.persistents[playerId] ?? [];
        const ownedTricks = state.tricks[playerId] ?? [];
        const owned = new Set([...ownedPersistents, ...ownedTricks]);
        const hardExclude = new Set();
        if (!findYanShi(state, playerId)) {
            YANSHI_SUBSKILLS.forEach((s) => hardExclude.add(s));
        }
        else {
            hardExclude.add("江湖众生·偃师");
        }
        if (!ownedPersistents.includes("战功晋升")) {
            hardExclude.add("战功晋升II");
        }
        const available = [];
        const fallback = [];
        for (const skill of ALL_SKILLS) {
            if (owned.has(skill) || hardExclude.has(skill))
                continue;
            if (this.skillPiecesOk(state, playerId, skill)) {
                available.push(skill);
            }
            else {
                fallback.push(skill);
            }
        }
        const pool = shuffle(available, state);
        for (const s of shuffle(fallback, state)) {
            if (pool.length >= 3)
                break;
            pool.push(s);
        }
        state.offer = { playerId, options: pool.slice(0, 3) };
        state.status = { kind: "playing", turn: state.players.indexOf(playerId) };
    }
    skillPiecesOk(state, playerId, skill) {
        const has = (...kinds) => this.hasOwnedKind(state, playerId, kinds);
        switch (skill) {
            case "快马加鞭":
                return horsesOnBaseline(state, playerId).length > 0;
            case "运筹帷幄":
                return elephantsOnBaseline(state, playerId).length > 0;
            case "衷心护主":
                return advisorsOnBaseline(state, playerId).length > 0;
            case "仙人指路":
            case "瞒天过海":
                return pawnsOnPawnLine(state, playerId).length > 0;
            case "迷你炮":
            case "空响炮":
            case "直角炮":
            case "士角炮":
                return myCannons(state, playerId).length > 0;
            case "冲击车":
            case "变形金刚·炮台":
            case "变形金刚·火铳":
            case "变形金刚·装甲":
                return myChariots(state, playerId).length > 0;
            case "无中生有":
                return emptyInitialSlots(state, playerId).length > 0;
            case "树上开花":
                return emptyPawnSlots(state, playerId).length > 0;
            case "火器制造·炮":
                return emptyCannonSlots(state, playerId).length > 0;
            case "火器制造·车":
                return emptyChariotSlots(state, playerId).length > 0;
            case "声东击西":
                return has("兵");
            case "招贤纳士":
                return emptyAdvisorElephantSlots(state, playerId).length > 0;
            case "招兵买马":
                return emptyPawnHorseSlots(state, playerId).length > 0;
            case "江湖众生·偃师":
                return yanShiPlacementSlots(state, playerId).length > 0;
            case "基础设施·掩体":
            case "基础设施·地雷":
                return emptyHalfSquares(state, playerId).length > 0;
            case "以逸待劳":
            case "左右逢源":
            case "兵的升变":
            case "战功晋升":
            case "战功晋升II":
                return has("兵");
            case "化整为零":
                return myPromotedRanks(state, playerId).length > 0;
            case "傀儡术·悬丝":
            case "傀儡术·皮影":
                return puppetSpawnSlots(state, playerId).length > 0;
            case "如履平地":
            case "骠骑将军":
                return has("马");
            case "良驹难寻·赤兔":
            case "良驹难寻·的卢":
            case "良驹难寻·白鹤":
            case "良驹难寻·绝影":
                return has("马") && emptyBackRows(state, playerId).length > 0;
            case "猛犸象":
                return has("马", "相");
            case "龙骑兵":
                return has("马", "兵");
            case "御驾亲征":
            case "破釜沉舟":
            case "秦王绕柱":
            case "闪赚腾挪":
            case "金蝉脱壳":
                return has("将");
            case "将魂犹在":
            case "择善而从":
            case "师夷长技":
                return has("相");
            case "化零为整":
                return this.hasMergePair(state, playerId);
            default:
                return true;
        }
    }
    hasOwnedKind(state, owner, kinds) {
        for (let y = 0; y < 10; y++)
            for (let x = 0; x < 9; x++) {
                const p = state.boardState[y][x];
                if (p && p.owner === owner && kinds.includes(p.kind))
                    return true;
            }
        return false;
    }
    hasMergePair(state, owner) {
        const counts = new Map();
        for (let y = 0; y < 10; y++)
            for (let x = 0; x < 9; x++) {
                const p = state.boardState[y][x];
                if (!p || p.owner !== owner || RANK_INDEX[p.kind] === undefined)
                    continue;
                counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);
            }
        for (const n of counts.values()) {
            if (n >= 2)
                return true;
        }
        return false;
    }
    endSkillPhase(state, playerId) {
        state.pendingSkill = null;
        state.round += 1;
        state.phantomSideArmed[playerId] = false;
        const next = (state.players.indexOf(playerId) + 1) % state.players.length;
        state.status = {
            kind: "playing",
            turn: next,
        };
        state.awaitingResurrect = state.resurrect[state.players[next]] ? state.players[next] : null;
        // 轮到下一位玩家时即清除其已过期的幻·兵（己方下一回合消失）
        this.clearExpiredPhantoms(state, state.players[next]);
        // 原型到期升级
        this.processPrototypeUpgrades(state);
    }
    addTrick(state, playerId, skill) {
        state.tricks[playerId] = state.tricks[playerId] ?? [];
        if (!state.tricks[playerId].includes(skill))
            state.tricks[playerId].push(skill);
    }
    hasTrick(state, playerId, skill) {
        return (state.tricks[playerId] ?? []).includes(skill);
    }
    consumeTrick(state, playerId, skill) {
        state.tricks[playerId] = (state.tricks[playerId] ?? []).filter((s) => s !== skill);
    }
    addPersistent(state, playerId, skill) {
        state.persistents[playerId] = state.persistents[playerId] ?? [];
        if (!state.persistents[playerId].includes(skill))
            state.persistents[playerId].push(skill);
    }
    hasPersistent(state, playerId, skill) {
        return (state.persistents[playerId] ?? []).includes(skill);
    }
    removePersistent(state, playerId, skill) {
        state.persistents[playerId] = (state.persistents[playerId] ?? []).filter((s) => s !== skill);
    }
}


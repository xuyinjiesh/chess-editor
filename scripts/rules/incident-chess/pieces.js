// Ported from xuyinjie's chess-room; see docs/INCIDENT_CHESS.md.
const ChineseChessPieceColors = ["Red", "Black"];
const IncidentChessPieceKinds = [
    "车", "马", "炮", "相", "士", "将", "兵", "迷你炮", "猛犸象", "骠骑将军", "龙骑兵", "后", "空响炮", "直角炮", "士角炮", "冲击车", "炮台", "直角炮台", "士角炮台", "火铳",
    "排长", "连长", "营长", "团长", "旅长", "师长", "军长", "司令", "掩体", "地雷", "装甲",
    "偃师", "傀儡·兵", "皮影·猴",
    "幻·兵", "虚·初始棋子",
    "原型·炮", "车·原型",
    "良驹", "赤兔", "的卢", "白鹤", "绝影", "幻·马",
];
const RANK_ORDER = [
    "兵", "排长", "连长", "营长", "团长", "旅长", "师长", "军长", "司令",
];
const RANK_INDEX = {
    兵: 0,
    排长: 1,
    连长: 2,
    营长: 3,
    团长: 4,
    旅长: 5,
    师长: 6,
    军长: 7,
    司令: 8,
};
const NEXT_RANK = {
    兵: "排长",
    排长: "连长",
    连长: "营长",
    营长: "团长",
    团长: "旅长",
    旅长: "师长",
    师长: "军长",
    军长: "司令",
};
class IncidentChessPiece {
    owner;
    pos;
    color;
    kind;
    /** 幻/虚棋子伪装成的真实身份（对方视角显示此身份） */
    mimicKind;
    /** 幻棋子在第几回合结束时消失（虚棋子不设，永续） */
    expiry;
    /** 原型·炮/车·原型：第几回合后升级为正式棋子 */
    upgradeAt;
    /** 护甲：被吃时护甲破碎，挡下一次攻击 */
    armored;
    /** 良驹：被马踩上后升级成的名驹（赤兔/的卢/白鹤/绝影） */
    steedKind;
    constructor(owner, pos, color, kind, mimicKind, expiry, armored = false, upgradeAt, steedKind) {
        this.owner = owner;
        this.pos = pos;
        this.color = color;
        this.kind = kind;
        this.mimicKind = mimicKind;
        this.expiry = expiry;
        this.armored = armored;
        this.upgradeAt = upgradeAt;
        this.steedKind = steedKind;
    }
}
function inOwnHalf(color, pos) {
    return color === "Red" ? pos.y >= 5 : pos.y <= 4;
}
function inOwnPalace(color, pos) {
    const [minY, maxY] = color === "Red" ? [7, 9] : [0, 2];
    return pos.x >= 3 && pos.x <= 5 && pos.y >= minY && pos.y <= maxY;
}
function pieceAt(cc, x, y) {
    return cc.boardState[y]?.[x] ?? null;
}
/** 虚·初始棋子：任意方（含己方）都可攻击 */
function isCapturableTarget(piece, cc, npos) {
    const c = pieceAt(cc, npos.x, npos.y);
    if (!c)
        return false;
    if (c.kind === "虚·初始棋子")
        return true;
    return c.owner !== piece.owner;
}
/** 空格可走，捕获目标同 isCapturableTarget（虚·初始棋子任意方可攻） */
function isEmptyOrCapturable(piece, cc, npos) {
    const c = pieceAt(cc, npos.x, npos.y);
    if (!c)
        return true;
    if (c.kind === "掩体")
        return false;
    if (c.kind === "虚·初始棋子")
        return true;
    return c.owner !== piece.owner;
}
function hintMove(piece, state) {
    if (piece.kind === "掩体" ||
        piece.kind === "地雷" ||
        piece.kind === "装甲" ||
        piece.kind === "幻·兵" ||
        piece.kind === "幻·马" ||
        piece.kind === "虚·初始棋子" ||
        piece.kind === "原型·炮" ||
        piece.kind === "车·原型" ||
        piece.kind === "良驹") {
        return [];
    }
    // These structures can be taken by either side; retain their occupancy as
    // screens/blockers while allowing the ordinary capture generators to see them.
    const boardState = state.boardState.map(row => row.map(p => p && p.owner === piece.owner && ['虚·初始棋子','装甲','地雷'].includes(p.kind) ? {...p,owner:'structure-target'} : p));
    const raw = hintMoveRaw(piece, {...state,boardState});
    // 掩体不可被吃：过滤所有占据掩体的格子
    return raw.filter((npos) => {
        const c = state.boardState[npos.y]?.[npos.x];
        return !c || c.kind !== "掩体";
    });
}
function hintMoveRaw(piece, state) {
    const cc = state;
    const persistents = cc.persistents?.[String(piece.owner)] ?? [];
    const noLeg = persistents.includes("如履平地");
    const generalOut = persistents.includes("御驾亲征");
    if (RANK_INDEX[piece.kind] !== undefined) {
        return ladderMoves(piece, state, persistents);
    }
    switch (piece.kind) {
        case "将": {
            let moves = hintMoveRelativeStep(piece, state, ORTHOGONAL_DIRS);
            if (!generalOut) {
                moves = moves.filter((npos) => inOwnPalace(piece.color, npos));
            }
            moves = moves.filter((npos) => isEmptyOrCapturable(piece, cc, npos));
            if (persistents.includes("骠骑将军")) {
                const mergeTargets = hintMoveRelativeStep(piece, state, ORTHOGONAL_DIRS).filter((npos) => {
                    const c = state.boardState[npos.y]?.[npos.x];
                    return c && c.owner === piece.owner && c.kind === "马";
                });
                moves = [...moves, ...mergeTargets];
            }
            if (persistents.includes("秦王绕柱")) {
                // 瞬移到九宫对面一格（以九宫中心镜像）
                const center = piece.color === "Red" ? { x: 4, y: 8 } : { x: 4, y: 1 };
                const npos = {
                    x: 2 * center.x - piece.pos.x,
                    y: 2 * center.y - piece.pos.y,
                };
                if ((npos.x !== piece.pos.x || npos.y !== piece.pos.y) &&
                    inOwnPalace(piece.color, npos) &&
                    isEmptyOrCapturable(piece, cc, npos)) {
                    moves = [...moves, npos];
                }
            }
            if (persistents.includes("闪赚腾挪")) {
                // 可在己方九宫之内斜向移动一格
                for (const [dx, dy] of DIAGONAL_DIRS) {
                    const npos = { x: piece.pos.x + dx, y: piece.pos.y + dy };
                    if (!checkPosInBoard(state, npos))
                        continue;
                    if (!inOwnPalace(piece.color, npos))
                        continue;
                    if (isEmptyOrCapturable(piece, cc, npos))
                        moves = [...moves, npos];
                }
            }
            if (persistents.includes("破釜沉舟") && !inOwnHalf(piece.color, piece.pos)) {
                moves = moves.filter((npos) => !inOwnHalf(piece.color, npos));
            }
            return moves;
        }
        case "骠骑将军": {
            return hintMove_中国象棋_马(piece, state);
        }
        case "后": {
            return [
                ...hintMoveOrthUnlimitedFight(piece, state),
                ...hintMoveDiagUnlimitedFight(piece, state),
            ];
        }
        case "傀儡·兵":
        case "皮影·猴": {
            return puppetMoves(piece, state);
        }
        case "士": {
            return hintMoveDiag1StepFight(piece, state)
                .filter((npos) => inOwnPalace(piece.color, npos))
                .filter((npos) => isEmptyOrCapturable(piece, cc, npos));
        }
        case "相": {
            const base = hintMoveRelativeStepWithEyeBlock(piece, state, STEPS_中国象棋_相)
                .filter((npos) => inOwnHalf(piece.color, npos))
                .filter((npos) => isEmptyOrCapturable(piece, cc, npos));
            let moves = base;
            if (persistents.includes("猛犸象")) {
                const mergeTargets = hintMoveRelativeStepWithEyeBlock(piece, state, STEPS_中国象棋_相)
                    .filter((npos) => inOwnHalf(piece.color, npos))
                    .filter((npos) => {
                    const c = state.boardState[npos.y]?.[npos.x];
                    return c && c.owner === piece.owner && c.kind === "马";
                });
                moves = [...moves, ...mergeTargets];
            }
            if (persistents.includes("择善而从") || persistents.includes("师夷长技")) {
                moves = [...moves, ...elephantBorrowMoves(piece, state, persistents)];
            }
            return moves;
        }
        case "马": {
            const horseSteps = STEPS_中国象棋_马;
            const base = noLeg
                ? hintMoveRelativeStep(piece, state, horseSteps).filter((npos) => isEmptyOrCapturable(piece, cc, npos))
                : hintMove_中国象棋_马(piece, state).filter((npos) => isEmptyOrCapturable(piece, cc, npos));
            const reachable = noLeg
                ? hintMoveRelativeStep(piece, state, horseSteps)
                : hintMoveRelativeStepWithEyeBlock(piece, state, STEPS_中国象棋_马);
            const mergeTargets = reachable.filter((npos) => {
                const c = state.boardState[npos.y]?.[npos.x];
                if (!c || c.owner !== piece.owner)
                    return false;
                if (c.kind === "良驹")
                    return true;
                if (persistents.includes("猛犸象") && c.kind === "相")
                    return true;
                if (persistents.includes("骠骑将军") && c.kind === "将")
                    return true;
                if (persistents.includes("龙骑兵") && c.kind === "兵")
                    return true;
                return false;
            });
            if (mergeTargets.length === 0)
                return base;
            return [...base, ...mergeTargets];
        }
        case "赤兔": {
            const horseSteps = STEPS_中国象棋_马;
            const horseMoves = (noLeg
                ? hintMoveRelativeStep(piece, state, horseSteps)
                : hintMove_中国象棋_马(piece, state)).filter((npos) => isEmptyOrCapturable(piece, cc, npos));
            // 向前突刺三格：沿纵线直刺，中间不可有子，可吃掉第一个遇到的敌子
            const forward = piece.color === "Red" ? -1 : 1;
            const lunge = [];
            for (let d = 1; d <= 3; d++) {
                const npos = { x: piece.pos.x, y: piece.pos.y + forward * d };
                if (!checkPosInBoard(state, npos))
                    break;
                const c = pieceAt(cc, npos.x, npos.y);
                if (!c) {
                    lunge.push(npos);
                    continue;
                }
                if (c.kind === "虚·初始棋子" || c.owner !== piece.owner) {
                    lunge.push(npos);
                }
                break;
            }
            return [...horseMoves, ...lunge];
        }
        case "的卢": {
            return hintMoveRelativeStep(piece, state, STEPS_中国象棋_马).filter((npos) => isEmptyOrCapturable(piece, cc, npos));
        }
        case "白鹤": {
            const horseSteps = STEPS_中国象棋_马;
            const horseMoves = (noLeg
                ? hintMoveRelativeStep(piece, state, horseSteps)
                : hintMove_中国象棋_马(piece, state)).filter((npos) => isEmptyOrCapturable(piece, cc, npos));
            const muMoves = hintMoveRelativeStep(piece, state, 目字步).filter((npos) => isEmptyOrCapturable(piece, cc, npos));
            return [...horseMoves, ...muMoves];
        }
        case "绝影": {
            const horseSteps = STEPS_中国象棋_马;
            const horseMoves = (noLeg
                ? hintMoveRelativeStep(piece, state, horseSteps)
                : hintMove_中国象棋_马(piece, state)).filter((npos) => isEmptyOrCapturable(piece, cc, npos));
            // 可停在中途：停在马的"腿"位（相邻正交一格）
            const midway = [];
            for (const [dx, dy] of ORTHOGONAL_DIRS) {
                const npos = { x: piece.pos.x + dx, y: piece.pos.y + dy };
                if (!checkPosInBoard(state, npos))
                    continue;
                if (isEmptyOrCapturable(piece, cc, npos))
                    midway.push(npos);
            }
            return [...horseMoves, ...midway];
        }
        case "龙骑兵": {
            const horseMoves = hintMove_中国象棋_马(piece, state).filter((npos) => isEmptyOrCapturable(piece, cc, npos));
            const forward = piece.color === "Red" ? -1 : 1;
            const crossed = !inOwnHalf(piece.color, piece.pos);
            const pawnMoves = [];
            const tryAdd = (dx, dy) => {
                const npos = { x: piece.pos.x + dx, y: piece.pos.y + dy };
                if (checkPosInBoard(state, npos) && isEmptyOrCapturable(piece, cc, npos)) {
                    pawnMoves.push(npos);
                }
            };
            tryAdd(0, forward);
            if (crossed) {
                tryAdd(-1, 0);
                tryAdd(1, 0);
            }
            return [...horseMoves, ...pawnMoves];
        }
        case "猛犸象": {
            const horseMoves = hintMoveRelativeStep(piece, state, STEPS_中国象棋_马);
            const elephMoves = hintMoveRelativeStep(piece, state, STEPS_中国象棋_相);
            return [...horseMoves, ...elephMoves].filter((npos) => isEmptyOrCapturable(piece, cc, npos));
        }
        case "车": {
            return hintMoveOrthUnlimitedFight(piece, state);
        }
        case "偃师": {
            // 按兵的方式移动（向前一格；过河后可左右一格），但不能吃子（仅走空格，可覆盖虚·初始棋子）
            const forward = piece.color === "Red" ? -1 : 1;
            const crossed = !inOwnHalf(piece.color, piece.pos);
            const candidates = [[0, forward]];
            if (crossed) {
                candidates.push([-1, 0], [1, 0]);
            }
            const results = [];
            for (const [dx, dy] of candidates) {
                const npos = { x: piece.pos.x + dx, y: piece.pos.y + dy };
                if (!checkPosInBoard(state, npos))
                    continue;
                const c = state.boardState[npos.y]?.[npos.x];
                if (!c || c.kind === "虚·初始棋子") {
                    results.push(npos);
                }
            }
            return results;
        }
        case "炮台":
        case "直角炮台":
        case "士角炮台":
        case "火铳": {
            return hintMoveOrthUnlimitedFight(piece, state);
        }
        case "冲击车": {
            return hintMoveOrthUnlimited(piece, state);
        }
        case "炮": {
            return hintTurretCannon(piece, state);
        }
        case "迷你炮": {
            const results = [];
            for (const [dx, dy] of ORTHOGONAL_DIRS) {
                for (let d = 1; d <= 3; d++) {
                    const nx = piece.pos.x + dx * d;
                    const ny = piece.pos.y + dy * d;
                    if (!checkPosInBoard(state, { x: nx, y: ny }))
                        break;
                    const c = state.boardState[ny][nx];
                    if (c === null) {
                        results.push({ x: nx, y: ny });
                    }
                    else {
                        if (c.owner !== piece.owner && c.kind !== "掩体") {
                            results.push({ x: nx, y: ny });
                        }
                        break;
                    }
                }
            }
            return results;
        }
        case "空响炮": {
            const results = hintMoveOrthUnlimited(piece, state);
            for (const [dx, dy] of ORTHOGONAL_DIRS) {
                let nx = piece.pos.x + dx;
                let ny = piece.pos.y + dy;
                while (checkPosInBoard(state, { x: nx, y: ny }) && checkPosIsEmpty(state, { x: nx, y: ny })) {
                    nx += dx;
                    ny += dy;
                }
                nx += dx;
                ny += dy;
                while (checkPosInBoard(state, { x: nx, y: ny }) && checkPosIsEmpty(state, { x: nx, y: ny })) {
                    results.push({ x: nx, y: ny });
                    nx += dx;
                    ny += dy;
                }
                if (checkPosInBoard(state, { x: nx, y: ny }) && isCapturableTarget(piece, cc, { x: nx, y: ny })) {
                    results.push({ x: nx, y: ny });
                }
            }
            return results;
        }
        case "直角炮": {
            const results = hintMoveOrthUnlimited(piece, state);
            for (const [dx, dy] of ORTHOGONAL_DIRS) {
                let nx = piece.pos.x + dx;
                let ny = piece.pos.y + dy;
                while (checkPosInBoard(state, { x: nx, y: ny }) && checkPosIsEmpty(state, { x: nx, y: ny })) {
                    nx += dx;
                    ny += dy;
                }
                if (!checkPosInBoard(state, { x: nx, y: ny })) {
                    continue;
                }
                for (const [dx2, dy2] of [[-dy, dx], [dy, -dx]]) {
                    let nx2 = nx + dx2;
                    let ny2 = ny + dy2;
                    while (checkPosInBoard(state, { x: nx2, y: ny2 }) && checkPosIsEmpty(state, { x: nx2, y: ny2 })) {
                        nx2 += dx2;
                        ny2 += dy2;
                    }
                    if (checkPosInBoard(state, { x: nx2, y: ny2 }) && isCapturableTarget(piece, cc, { x: nx2, y: ny2 })) {
                        results.push({ x: nx2, y: ny2 });
                    }
                }
            }
            return [...results, ...turretMergeTargets(piece, state)];
        }
        case "士角炮": {
            const results = hintMoveOrthUnlimited(piece, state);
            for (const [dx, dy] of ORTHOGONAL_DIRS) {
                let nx = piece.pos.x + dx;
                let ny = piece.pos.y + dy;
                while (checkPosInBoard(state, { x: nx, y: ny }) && checkPosIsEmpty(state, { x: nx, y: ny })) {
                    nx += dx;
                    ny += dy;
                }
                if (!checkPosInBoard(state, { x: nx, y: ny })) {
                    continue;
                }
                for (const [dx2, dy2] of DIAGONAL_DIRS) {
                    let nx2 = nx + dx2;
                    let ny2 = ny + dy2;
                    while (checkPosInBoard(state, { x: nx2, y: ny2 }) && checkPosIsEmpty(state, { x: nx2, y: ny2 })) {
                        nx2 += dx2;
                        ny2 += dy2;
                    }
                    if (checkPosInBoard(state, { x: nx2, y: ny2 }) && isCapturableTarget(piece, cc, { x: nx2, y: ny2 })) {
                        results.push({ x: nx2, y: ny2 });
                    }
                }
            }
            return [...results, ...turretMergeTargets(piece, state)];
        }
        default:
            return [];
    }
}
function elephantBorrowMoves(piece, state, persistents) {
    const out = [];
    const dirs = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
    ];
    for (const [dx, dy] of dirs) {
        const nx = piece.pos.x + dx;
        const ny = piece.pos.y + dy;
        if (!checkPosInBoard(state, { x: nx, y: ny }))
            continue;
        const c = state.boardState[ny][nx];
        if (!c)
            continue;
        const wantFriendly = persistents.includes("择善而从") && c.owner === piece.owner;
        const wantEnemy = persistents.includes("师夷长技") && c.owner !== piece.owner;
        if (!wantFriendly && !wantEnemy)
            continue;
        if (c.kind === "相")
            continue; // 相自身走法含借用，避免递归
        const temp = new IncidentChessPiece(piece.owner, { x: piece.pos.x, y: piece.pos.y }, piece.color, c.kind);
        out.push(...hintMove(temp, state).filter(to => {
            const target=state.boardState[to.y][to.x];
            return !target || target.owner !== piece.owner || ['虚·初始棋子','装甲','地雷'].includes(target.kind);
        }));
    }
    return out;
}
function hintTurretCannon(piece, state) {
    const results = hintMoveOrthUnlimited(piece, state);
    for (const [dx, dy] of ORTHOGONAL_DIRS) {
        let nx = piece.pos.x + dx;
        let ny = piece.pos.y + dy;
        while (checkPosInBoard(state, { x: nx, y: ny }) &&
            checkPosIsEmpty(state, { x: nx, y: ny })) {
            nx += dx;
            ny += dy;
        }
        if (!checkPosInBoard(state, { x: nx, y: ny }))
            continue;
        const screen = state.boardState[ny][nx];
        let diagonal = null;
        if (screen?.kind === "直角炮台")
            diagonal = false;
        else if (screen?.kind === "士角炮台")
            diagonal = true;
        if (diagonal !== null) {
            const dirs = diagonal ? DIAGONAL_DIRS : [[dy, dx], [-dy, -dx]];
            for (const [dx2, dy2] of dirs) {
                let tx = nx + dx2;
                let ty = ny + dy2;
                while (checkPosInBoard(state, { x: tx, y: ty })) {
                    const c = state.boardState[ty][tx];
                    if (c) {
                        if (c.owner !== piece.owner && c.kind !== "掩体") {
                            results.push({ x: tx, y: ty });
                        }
                        break;
                    }
                    tx += dx2;
                    ty += dy2;
                }
            }
        }
        else {
            nx += dx;
            ny += dy;
            while (checkPosInBoard(state, { x: nx, y: ny }) &&
                checkPosIsEmpty(state, { x: nx, y: ny })) {
                nx += dx;
                ny += dy;
            }
            if (checkPosInBoard(state, { x: nx, y: ny })) {
                const c = state.boardState[ny][nx];
                if (c && c.owner !== piece.owner) {
                    results.push({ x: nx, y: ny });
                }
            }
        }
    }
    return results;
}
function turretMergeTargets(piece, state) {
    const out = [];
    for (const [dx, dy] of ORTHOGONAL_DIRS) {
        let nx = piece.pos.x + dx;
        let ny = piece.pos.y + dy;
        while (checkPosInBoard(state, { x: nx, y: ny }) &&
            checkPosIsEmpty(state, { x: nx, y: ny })) {
            nx += dx;
            ny += dy;
        }
        if (!checkPosInBoard(state, { x: nx, y: ny }))
            continue;
        const c = state.boardState[ny][nx];
        if (c && c.owner === piece.owner && c.kind === "炮台") {
            out.push({ x: nx, y: ny });
        }
    }
    return out;
}
function ladderOffsets(piece, inOwn, persistents) {
    const idx = RANK_INDEX[piece.kind] ?? 0;
    const forward = piece.color === "Red" ? -1 : 1;
    const back = -forward;
    const candidates = [[0, forward]];
    if (!inOwn || idx >= 1 || persistents.includes("左右逢源")) {
        candidates.push([-1, 0], [1, 0]);
    }
    if (inOwn && idx >= 2) {
        candidates.push([0, back]);
    }
    if (idx === 3 || idx === 4 || idx === 8) {
        candidates.push([forward, 1], [forward, -1]);
    }
    if (idx === 4 || idx === 8) {
        candidates.push([back, 1], [back, -1]);
    }
    return candidates;
}
function puppetMoves(piece, state) {
    const canCapture = piece.kind === "傀儡·兵";
    const forward = piece.color === "Red" ? -1 : 1;
    const crossed = !inOwnHalf(piece.color, piece.pos);
    const candidates = [[0, forward]];
    if (crossed) {
        candidates.push([-1, 0], [1, 0]);
    }
    const results = [];
    for (const [dx, dy] of candidates) {
        const nx = piece.pos.x + dx;
        const ny = piece.pos.y + dy;
        if (!checkPosInBoard(state, { x: nx, y: ny }))
            continue;
        const c = state.boardState[ny][nx];
        if (c === null) {
            results.push({ x: nx, y: ny });
        }
        else if (canCapture && c.owner !== piece.owner && c.kind !== "掩体") {
            results.push({ x: nx, y: ny });
        }
    }
    return results;
}
function ladderMoves(piece, state, persistents) {
    const cc = state;
    const inOwn = inOwnHalf(piece.color, piece.pos);
    const offsets = ladderOffsets(piece, inOwn, persistents);
    const results = [];
    for (const [dx, dy] of offsets) {
        const npos = { x: piece.pos.x + dx, y: piece.pos.y + dy };
        if (checkPosInBoard(state, npos) && isEmptyOrCapturable(piece, cc, npos)) {
            results.push(npos);
        }
    }
    if (persistents.includes("化零为整") && NEXT_RANK[piece.kind]) {
        for (const [dx, dy] of offsets) {
            const npos = { x: piece.pos.x + dx, y: piece.pos.y + dy };
            if (!checkPosInBoard(state, npos))
                continue;
            const c = state.boardState[npos.y][npos.x];
            if (c && c.owner === piece.owner && c.kind === piece.kind) {
                results.push(npos);
            }
        }
    }
    if (persistents.includes("龙骑兵") && piece.kind === '兵') {
        for (const [dx, dy] of offsets) {
            const npos = { x: piece.pos.x + dx, y: piece.pos.y + dy };
            if (!checkPosInBoard(state, npos))
                continue;
            const c = state.boardState[npos.y][npos.x];
            if (c && c.owner === piece.owner && c.kind === "马") {
                results.push(npos);
            }
        }
    }
    return results;
}
const DISPLAY_NAMES = {
    Red: { 将: "帥", 士: "仕", 相: "相", 车: "車", 马: "馬", 炮: "炮", 兵: "兵", 迷你炮: "迷", 猛犸象: "猛", 骠骑将军: "骠", 龙骑兵: "龙", 后: "后", 空响炮: "空", 直角炮: "直", 士角炮: "士", 冲击车: "冲", 炮台: "炮", 直角炮台: "直", 士角炮台: "士", 火铳: "铳", 排长: "排", 连长: "连", 营长: "营", 团长: "团", 旅长: "旅", 师长: "师", 军长: "军", 司令: "元", 掩体: "掩", 地雷: "雷", 装甲: "甲", 偃师: "偃", 傀儡·兵: "傀", 皮影·猴: "影", 幻·兵: "幻", 幻·马: "幻", 虚·初始棋子: "虚", 原型·炮: "原", 车·原型: "原", 良驹: "驹", 赤兔: "赤", 的卢: "卢", 白鹤: "鹤", 绝影: "绝" },
    Black: { 将: "將", 士: "士", 相: "象", 车: "車", 马: "馬", 炮: "砲", 兵: "卒", 迷你炮: "迷", 猛犸象: "猛", 骠骑将军: "骠", 龙骑兵: "龙", 后: "后", 空响炮: "空", 直角炮: "直", 士角炮: "士", 冲击车: "冲", 炮台: "炮", 直角炮台: "直", 士角炮台: "士", 火铳: "铳", 排长: "排", 连长: "连", 营长: "营", 团长: "团", 旅长: "旅", 师长: "师", 军长: "军", 司令: "元", 掩体: "掩", 地雷: "雷", 装甲: "甲", 偃师: "偃", 傀儡·兵: "傀", 皮影·猴: "影", 幻·兵: "幻", 幻·马: "幻", 虚·初始棋子: "虚", 原型·炮: "原", 车·原型: "原", 良驹: "驹", 赤兔: "赤", 的卢: "卢", 白鹤: "鹤", 绝影: "绝" },
};
function displayName(color, kind) {
    return DISPLAY_NAMES[color][kind] ?? kind;
}
function isOnBaseline(color, y) {
    return color === "Red" ? y === 9 : y === 0;
}
function isOnOpponentBaseline(color, y) {
    return color === "Red" ? y === 0 : y === 9;
}
function isOnPawnLine(color, y) {
    return color === "Red" ? y === 6 : y === 3;
}
function acrossRiverPos(color, x) {
    return color === "Red" ? { x, y: 4 } : { x, y: 5 };
}
function horsesOnBaseline(cc, owner) {
    const out = [];
    for (let y = 0; y < 10; y++)
        for (let x = 0; x < 9; x++) {
            const p = cc.boardState[y][x];
            if (p &&
                p.owner === owner &&
                p.kind === "马" &&
                isOnBaseline(p.color, y))
                out.push({ x, y });
        }
    return out;
}
function elephantsOnBaseline(cc, owner) {
    const out = [];
    for (let y = 0; y < 10; y++)
        for (let x = 0; x < 9; x++) {
            const p = cc.boardState[y][x];
            if (p &&
                p.owner === owner &&
                p.kind === "相" &&
                isOnBaseline(p.color, y))
                out.push({ x, y });
        }
    return out;
}
function advisorsOnBaseline(cc, owner) {
    const out = [];
    for (let y = 0; y < 10; y++)
        for (let x = 0; x < 9; x++) {
            const p = cc.boardState[y][x];
            if (p &&
                p.owner === owner &&
                p.kind === "士" &&
                isOnBaseline(p.color, y))
                out.push({ x, y });
        }
    return out;
}
function pawnsOnPawnLine(cc, owner) {
    const out = [];
    for (let y = 0; y < 10; y++)
        for (let x = 0; x < 9; x++) {
            const p = cc.boardState[y][x];
            if (p && p.owner === owner && p.kind === "兵" && isOnPawnLine(p.color, y))
                out.push({ x, y });
        }
    return out;
}
function myPawns(cc, owner) {
    const out = [];
    for (let y = 0; y < 10; y++)
        for (let x = 0; x < 9; x++) {
            const p = cc.boardState[y][x];
            if (p && p.owner === owner && p.kind === "兵")
                out.push({ x, y });
        }
    return out;
}
function myCannons(cc, owner) {
    const out = [];
    for (let y = 0; y < 10; y++)
        for (let x = 0; x < 9; x++) {
            const p = cc.boardState[y][x];
            if (p && p.owner === owner && p.kind === "炮")
                out.push({ x, y });
        }
    return out;
}
function myChariots(cc, owner) {
    const out = [];
    for (let y = 0; y < 10; y++)
        for (let x = 0; x < 9; x++) {
            const p = cc.boardState[y][x];
            if (p && p.owner === owner && p.kind === "车")
                out.push({ x, y });
        }
    return out;
}
function emptyPawnSlots(cc, owner) {
    const color = cc.playerToPieceColor[owner];
    const xs = [0, 2, 4, 6, 8];
    const y = color === "Red" ? 6 : 3;
    const out = [];
    for (const x of xs) {
        if (!cc.boardState[y][x])
            out.push({ x, y });
    }
    return out;
}
function emptyAdvisorElephantSlots(cc, owner) {
    const color = cc.playerToPieceColor[owner];
    const y = color === "Red" ? 9 : 0;
    const xs = [3, 5, 2, 6];
    const out = [];
    for (const x of xs) {
        if (!cc.boardState[y][x])
            out.push({ x, y });
    }
    return out;
}
function emptyPawnHorseSlots(cc, owner) {
    const color = cc.playerToPieceColor[owner];
    const y = color === "Red" ? 6 : 3;
    const out = [];
    for (const x of [0, 2, 4, 6, 8]) {
        if (!cc.boardState[y][x])
            out.push({ x, y });
    }
    const hy = color === "Red" ? 9 : 0;
    for (const x of [1, 7]) {
        if (!cc.boardState[hy][x])
            out.push({ x, y: hy });
    }
    return out;
}
/** 该初始位置对应的真实棋子身份（用于虚·初始棋子伪装） */
function initialKindAt(color, x, y) {
    const pawnY = color === "Red" ? 6 : 3;
    const backY = color === "Red" ? 9 : 0;
    const cannonY = color === "Red" ? 7 : 2;
    if (y === pawnY && [0, 2, 4, 6, 8].includes(x))
        return "兵";
    if (y === backY) {
        if (x === 0 || x === 8)
            return "车";
        if (x === 1 || x === 7)
            return "马";
        if (x === 2 || x === 6)
            return "相";
        if (x === 3 || x === 5)
            return "士";
        if (x === 4)
            return "将";
    }
    if (y === cannonY && (x === 1 || x === 7))
        return "炮";
    return null;
}
/** 空着的初始摆放位置（无中生有生成虚·初始棋子用） */
function emptyInitialSlots(cc, owner) {
    const color = cc.playerToPieceColor[owner];
    const out = [];
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 9; x++) {
            if (!initialKindAt(color, x, y))
                continue;
            if (cc.boardState[y][x])
                continue;
            out.push({ x, y });
        }
    }
    return out;
}
/** 空炮位（火器制造·炮 生成原型·炮用） */
function emptyCannonSlots(cc, owner) {
    const color = cc.playerToPieceColor[owner];
    const y = color === "Red" ? 7 : 2;
    const out = [];
    for (const x of [1, 7]) {
        if (!cc.boardState[y][x])
            out.push({ x, y });
    }
    return out;
}
/** 空车位（火器制造·车 生成车·原型用） */
function emptyChariotSlots(cc, owner) {
    const color = cc.playerToPieceColor[owner];
    const y = color === "Red" ? 9 : 0;
    const out = [];
    for (const x of [0, 8]) {
        if (!cc.boardState[y][x])
            out.push({ x, y });
    }
    return out;
}
function emptyHalfSquares(cc, owner) {
    const color = cc.playerToPieceColor[owner];
    const out = [];
    for (let y = 0; y < 10; y++)
        for (let x = 0; x < 9; x++) {
            if (cc.boardState[y][x])
                continue;
            const inOwn = color === "Red" ? y >= 5 : y <= 4;
            if (inOwn)
                out.push({ x, y });
        }
    return out;
}
/** 我方后三行空格（良驹难寻生成良驹用） */
function emptyBackRows(cc, owner) {
    const color = cc.playerToPieceColor[owner];
    const out = [];
    for (let y = 0; y < 10; y++)
        for (let x = 0; x < 9; x++) {
            if (cc.boardState[y][x])
                continue;
            const inBack = color === "Red" ? y >= 7 : y <= 2;
            if (inBack)
                out.push({ x, y });
        }
    return out;
}
function myPromotedRanks(cc, owner) {
    const out = [];
    for (let y = 0; y < 10; y++)
        for (let x = 0; x < 9; x++) {
            const p = cc.boardState[y][x];
            const idx = p ? RANK_INDEX[p.kind] : undefined;
            if (p && p.owner === owner && idx !== undefined && idx >= 1) {
                out.push({ x, y });
            }
        }
    return out;
}
function findYanShi(cc, owner) {
    for (let y = 0; y < 10; y++)
        for (let x = 0; x < 9; x++) {
            const p = cc.boardState[y][x];
            if (p && p.owner === owner && p.kind === "偃师") {
                return { x, y };
            }
        }
    return null;
}
function puppetRange(cc, owner) {
    return (cc.persistents?.[owner] ?? []).includes("大衍诀") ? 2 : 1;
}
function inPuppetRange(cc, owner, pos) {
    const yan = findYanShi(cc, owner);
    if (!yan)
        return false;
    const r = puppetRange(cc, owner);
    return Math.max(Math.abs(pos.x - yan.x), Math.abs(pos.y - yan.y)) <= r;
}
function yanShiPlacementSlots(cc, owner) {
    const color = cc.playerToPieceColor[owner];
    const out = [];
    for (let y = 0; y < 10; y++)
        for (const x of [0, 8]) {
            if (cc.boardState[y][x])
                continue;
            const inOwn = color === "Red" ? y >= 5 : y <= 4;
            if (inOwn)
                out.push({ x, y });
        }
    return out;
}
function puppetSpawnSlots(cc, owner) {
    const out = [];
    for (let y = 0; y < 10; y++)
        for (let x = 0; x < 9; x++) {
            if (cc.boardState[y][x])
                continue;
            if (inPuppetRange(cc, owner, { x, y }))
                out.push({ x, y });
        }
    return out;
}

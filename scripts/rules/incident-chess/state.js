// Ported from xuyinjie's chess-room; see docs/INCIDENT_CHESS.md.
const GAME_TITLE = "异变象棋";
class IncidentChessState {
    boardSize;
    boardState;
    players;
    playerToPieceColor;
    status;
    offer;
    pendingSkill;
    tricks;
    persistents;
    resurrect;
    awaitingResurrect;
    doubleMovePos;
    pendingSecondMove;
    /** 回合计数（锦囊/幻子过期用） */
    round;
    /** 声东击西：本回合已武装，等待首次左右移兵 */
    phantomSideArmed;
    constructor(players) {
        this.boardSize = new BoardSize(9, 10);
        this.boardState = Array.from({ length: 10 }, () => Array(9).fill(null));
        this.players = players;
        this.playerToPieceColor = {};
        this.status = { kind: "playing", turn: 0 };
        this.offer = null;
        this.pendingSkill = null;
        this.tricks = {};
        this.persistents = {};
        this.resurrect = {};
        this.awaitingResurrect = null;
        this.doubleMovePos = {};
        this.pendingSecondMove = null;
        this.round = 0;
        this.phantomSideArmed = {};
        this.assignColors();
        this.initBoard();
    }
    assignColors() {
        const redIdx = Math.random() < 0.5 ? 0 : 1;
        this.playerToPieceColor[this.players[redIdx]] = "Red";
        this.playerToPieceColor[this.players[redIdx ^ 1]] = "Black";
        this.status = { kind: "playing", turn: redIdx };
    }
    initBoard() {
        const ownerOf = (color) => {
            const entry = Object.entries(this.playerToPieceColor).find(([, c]) => c === color);
            return entry ? entry[0] : this.players[0];
        };
        const redOwner = ownerOf("Red");
        const blackOwner = ownerOf("Black");
        const place = (x, y, owner, color, kind) => {
            this.boardState[y][x] = new IncidentChessPiece(owner, { x: x, y: y }, color, kind);
        };
        const backRow = [
            "车",
            "马",
            "相",
            "士",
            "将",
            "士",
            "相",
            "马",
            "车",
        ];
        for (let x = 0; x < 9; x++) {
            place(x, 0, blackOwner, "Black", backRow[x]);
            place(x, 9, redOwner, "Red", backRow[x]);
        }
        place(1, 2, blackOwner, "Black", "炮");
        place(7, 2, blackOwner, "Black", "炮");
        place(1, 7, redOwner, "Red", "炮");
        place(7, 7, redOwner, "Red", "炮");
        for (let x = 0; x <= 8; x += 2) {
            place(x, 3, blackOwner, "Black", "兵");
            place(x, 6, redOwner, "Red", "兵");
        }
    }
    checkWin(playerId) {
        const myColor = this.playerToPieceColor[playerId];
        if (!myColor) {
            return false;
        }
        const opponentColor = myColor === "Red" ? "Black" : "Red";
        for (const row of this.boardState) {
            for (const piece of row) {
                if (piece &&
                    piece.color === opponentColor &&
                    (piece.kind === "将" || piece.kind === "骠骑将军")) {
                    return false;
                }
            }
        }
        return true;
    }
    reset() {
        this.boardState = Array.from({ length: 10 }, () => Array(9).fill(null));
        this.playerToPieceColor = {};
        this.offer = null;
        this.pendingSkill = null;
        this.tricks = {};
        this.persistents = {};
        this.resurrect = {};
        this.awaitingResurrect = null;
        this.doubleMovePos = {};
        this.pendingSecondMove = null;
        this.round = 0;
        this.phantomSideArmed = {};
        this.assignColors();
        this.initBoard();
    }
}

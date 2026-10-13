// Ported from xuyinjie's chess-room; see docs/INCIDENT_CHESS.md.
const Pos = {
    of(x, y) {
        return { x, y };
    },
    add(a, b) {
        return { x: a.x + b.x, y: a.y + b.y };
    },
    sub(a, b) {
        return { x: a.x - b.x, y: a.y - b.y };
    },
    mul(a, s) {
        return { x: a.x * s, y: a.y * s };
    },
    div(a, s) {
        if (s === 0)
            throw new Error("Cannot divide by zero");
        return { x: a.x / s, y: a.y / s };
    },
    dot(a, b) {
        return a.x * b.x + a.y * b.y;
    },
    norm1(a) {
        return Math.abs(a.x) + Math.abs(a.y);
    },
    norm2(a) {
        return Math.hypot(a.x, a.y);
    },
    normp(a) {
        return Math.max(Math.abs(a.x), Math.abs(a.y));
    },
    onOrth(a) {
        return a.x === 0 || a.y === 0;
    },
    onDiag(a) {
        return a.x === a.y || -a.x === a.y;
    },
    onOrthOrDiag(a) {
        return a.x === 0 || a.y === 0 || a.x === a.y || -a.x === a.y;
    },
    equals(a, b) {
        return a.x === b.x && a.y === b.y;
    },
};
class BoardSize {
    size;
    constructor(x, y) {
        this.size = { x, y };
    }
}
;

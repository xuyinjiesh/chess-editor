// Ported from xuyinjie's chess-room; see docs/INCIDENT_CHESS.md.
// ----------------------------------------------------------------------
const ORTHOGONAL_DIRS = [[-1, 0], [0, -1], [0, 1], [1, 0]];
const DIAGONAL_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
function hintMoveOrthUnlimited(piece, state) {
    const results = [];
    for (const [dx, dy] of ORTHOGONAL_DIRS) {
        let nx = piece.pos.x + dx;
        let ny = piece.pos.y + dy;
        while (checkPosInBoard(state, { x: nx, y: ny }) && checkPosIsEmpty(state, { x: nx, y: ny })) {
            results.push({ x: nx, y: ny });
            nx += dx;
            ny += dy;
        }
    }
    return results;
}
function hintMoveOrthUnlimitedFight(piece, state) {
    const results = [];
    for (const [dx, dy] of ORTHOGONAL_DIRS) {
        let nx = piece.pos.x + dx;
        let ny = piece.pos.y + dy;
        while (checkPosInBoard(state, { x: nx, y: ny }) && checkPosIsEmpty(state, { x: nx, y: ny })) {
            results.push({ x: nx, y: ny });
            nx += dx;
            ny += dy;
        }
        if (checkPosInBoard(state, { x: nx, y: ny }) && checkPosIsEnemy(piece, state, { x: nx, y: ny })) {
            results.push({ x: nx, y: ny });
        }
    }
    return results;
}
function hintMoveDiagUnlimited(piece, state) {
    const results = [];
    for (const [dx, dy] of DIAGONAL_DIRS) {
        let nx = piece.pos.x + dx;
        let ny = piece.pos.y + dy;
        while (checkPosInBoard(state, { x: nx, y: ny }) && checkPosIsEmpty(state, { x: nx, y: ny })) {
            results.push({ x: nx, y: ny });
            nx += dx;
            ny += dy;
        }
    }
    return results;
}
function hintMoveDiagUnlimitedFight(piece, state) {
    const results = [];
    for (const [dx, dy] of DIAGONAL_DIRS) {
        let nx = piece.pos.x + dx;
        let ny = piece.pos.y + dy;
        while (checkPosInBoard(state, { x: nx, y: ny }) && checkPosIsEmpty(state, { x: nx, y: ny })) {
            results.push({ x: nx, y: ny });
            nx += dx;
            ny += dy;
        }
        if (checkPosInBoard(state, { x: nx, y: ny }) && checkPosIsEnemy(piece, state, { x: nx, y: ny })) {
            results.push({ x: nx, y: ny });
        }
    }
    return results;
}
function hintMoveOrth1Step(piece, state) {
    const results = [];
    for (const [dx, dy] of ORTHOGONAL_DIRS) {
        const nx = piece.pos.x + dx;
        const ny = piece.pos.y + dy;
        if (checkPosInBoard(state, { x: nx, y: ny }) && checkPosIsEmpty(state, { x: nx, y: ny })) {
            results.push({ x: nx, y: ny });
        }
    }
    return results;
}
;
function hintMoveOrth1StepFight(piece, state) {
    const results = [];
    for (const [dx, dy] of ORTHOGONAL_DIRS) {
        const nx = piece.pos.x + dx;
        const ny = piece.pos.y + dy;
        if (checkPosInBoard(state, { x: nx, y: ny })) {
            if (checkPosIsEmptyOrEnemy(piece, state, { x: nx, y: ny })) {
                results.push({ x: nx, y: ny });
            }
        }
    }
    return results;
}
;
function hintMoveOrth2StepFight(piece, state) {
    const results = [];
    for (const [dx, dy] of ORTHOGONAL_DIRS) {
        for (let _ = 0; _ < 2; _++) {
            const nx = piece.pos.x + dx;
            const ny = piece.pos.y + dy;
            if (checkPosInBoard(state, { x: nx, y: ny })) {
                if (checkPosIsOwnTeam(piece, state, { x: nx, y: ny })) {
                    break;
                }
                else if (checkPosIsEmpty(state, { x: nx, y: ny })) {
                    results.push({ x: nx, y: ny });
                    continue;
                }
                else {
                    results.push({ x: nx, y: ny });
                    break;
                }
            }
        }
    }
    return results;
}
;
function hintMoveOrth3StepFight(piece, state) {
    const results = [];
    for (const [dx, dy] of ORTHOGONAL_DIRS) {
        let nx = piece.pos.x + dx;
        let ny = piece.pos.y + dy;
        for (let _ = 0; _ < 3; _++) {
            if (checkPosInBoard(state, { x: nx, y: ny })) {
                if (checkPosIsOwnTeam(piece, state, { x: nx, y: ny })) {
                    break;
                }
                else if (checkPosIsEmpty(state, { x: nx, y: ny })) {
                    results.push({ x: nx, y: ny });
                }
                else {
                    results.push({ x: nx, y: ny });
                    break;
                }
            }
            nx += dx;
            ny += dy;
        }
    }
    return results;
}
;
function hintMoveDiag1Step(piece, state) {
    const results = [];
    for (const [dx, dy] of DIAGONAL_DIRS) {
        const nx = piece.pos.x + dx;
        const ny = piece.pos.y + dy;
        if (checkPosInBoard(state, { x: nx, y: ny }) && checkPosIsEmpty(state, { x: nx, y: ny })) {
            results.push({ x: nx, y: ny });
        }
    }
    return results;
}
;
function hintMoveDiag1StepFight(piece, state) {
    const results = [];
    for (const [dx, dy] of DIAGONAL_DIRS) {
        const nx = piece.pos.x + dx;
        const ny = piece.pos.y + dy;
        if (checkPosInBoard(state, { x: nx, y: ny }) && checkPosIsEmptyOrEnemy(piece, state, { x: nx, y: ny })) {
            results.push({ x: nx, y: ny });
        }
    }
    return results;
}
;
function hintMoveOrthAndDiag1Step(piece, state) {
    const results = [];
    for (const [dx, dy] of ORTHOGONAL_DIRS) {
        const nx = piece.pos.x + dx;
        const ny = piece.pos.y + dy;
        if (checkPosInBoard(state, { x: nx, y: ny }) && checkPosIsEmpty(state, { x: nx, y: ny })) {
            results.push({ x: nx, y: ny });
        }
    }
    for (const [dx, dy] of DIAGONAL_DIRS) {
        const nx = piece.pos.x + dx;
        const ny = piece.pos.y + dy;
        if (checkPosInBoard(state, { x: nx, y: ny }) && checkPosIsEmpty(state, { x: nx, y: ny })) {
            results.push({ x: nx, y: ny });
        }
    }
    return results;
}
;
function hintMoveRelativeStep(piece, state, stepTo) {
    const results = [];
    for (const [dx, dy] of stepTo) {
        const nx = piece.pos.x + dx;
        const ny = piece.pos.y + dy;
        if (checkPosInBoard(state, { x: nx, y: ny })) {
            results.push({ x: nx, y: ny });
        }
    }
    return results;
}
;
function hintMoveRelativeStepWithEyeBlock(piece, state, stepTo) {
    const results = [];
    for (const [dx, dy, edx, edy] of stepTo) {
        const nx = piece.pos.x + dx;
        const ny = piece.pos.y + dy;
        const epos = { x: piece.pos.x + edx, y: piece.pos.y + edy };
        if (checkPosInBoard(state, { x: nx, y: ny }) && checkPosIsEmpty(state, epos)) {
            results.push({ x: nx, y: ny });
        }
    }
    return results;
}
function hintMoveChessKing(piece, state) {
    return [...hintMoveOrth1Step(piece, state), ...hintMoveDiag1Step(piece, state)];
}
const STEPS_国际象棋_骑士 = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const 日字步 = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const 田字步 = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
const 目字步 = [[-3, -1], [-3, 1], [-1, -3], [-1, 3], [1, -3], [1, 3], [3, -1], [3, 1]];
const 大目字步 = [[-3, -2], [-3, 2], [-2, -3], [-2, 3], [2, -3], [2, 3], [3, -2], [3, 2]];
const STEPS_中国象棋_马 = [
    [1, 2, 0, 1],
    [-1, 2, 0, 1],
    [1, -2, 0, -1],
    [-1, -2, 0, -1],
    [2, 1, 1, 0],
    [-2, 1, -1, 0],
    [2, -1, 1, 0],
    [-2, -1, -1, 0],
];
const STEPS_中国象棋_相 = [
    [2, 2, 1, 1],
    [-2, 2, -1, 1],
    [2, -2, 1, -1],
    [-2, -2, -1, -1],
];
function hintMove_国际象棋_骑士(piece, state) {
    return hintMoveRelativeStep(piece, state, STEPS_国际象棋_骑士)
        .filter(npos => checkPosIsEmptyOrEnemy(piece, state, npos));
}
function hintMove_中国象棋_马(piece, state) {
    return hintMoveRelativeStepWithEyeBlock(piece, state, STEPS_中国象棋_马)
        .filter(npos => checkPosIsEmptyOrEnemy(piece, state, npos));
}
function hintMove_中国象棋_炮(piece, state) {
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
            nx += dx;
            ny += dy;
            continue;
        }
        if (checkPosInBoard(state, { x: nx, y: ny }) && checkPosIsEnemy(piece, state, { x: nx, y: ny })) {
            results.push({ x: nx, y: ny });
        }
    }
    return results;
}
// ----------------------------------------------------------------------
// export function checkMoveViaHint(piece: Piece, state: GameState, dst: Position): boolean {
//   if (!piece.hintMove) {
//     return false;
//   }
//   return piece.hintMove(state).includes(dst);
// }
function checkPosInBoard(state, dst) {
    const size = state.boardSize.size;
    return dst.x >= 0 && dst.x < size.x && dst.y >= 0 && dst.y < size.y;
}
function checkPosIsEmpty(state, dst) {
    return state.boardState[dst.y][dst.x] === null;
}
function checkPosIsOwnTeam(piece, state, dst) {
    const npiece = state.boardState[dst.y][dst.x];
    return npiece !== null && piece.owner === npiece.owner;
}
function checkPosIsEnemy(piece, state, dst) {
    const npiece = state.boardState[dst.y][dst.x];
    return npiece !== null && piece.owner !== npiece.owner;
}
function checkPosIsEmptyOrEnemy(piece, state, dst) {
    const npiece = state.boardState[dst.y][dst.x];
    return npiece === null || piece.owner !== npiece.owner;
}

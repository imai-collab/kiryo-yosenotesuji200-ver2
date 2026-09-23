import * as ShogiModule from 'shogi.js';
import { Color, Move, Problem, Position } from '../types';

export const Shogi = (ShogiModule as any).Shogi || (ShogiModule as any).default || ShogiModule;
export const Piece = (ShogiModule as any).Piece || (ShogiModule as any).default?.Piece;

export const PIECE_NAMES: Record<string, string> = {
  FU: '歩',
  KY: '香',
  KE: '桂',
  GI: '銀',
  KI: '金',
  KA: '角',
  HI: '飛',
  OU: '玉',
  TO: 'と',
  NY: '杏',
  NK: '圭',
  NG: '全',
  UM: '馬',
  RY: '龍',
};

export const fillGoteHand = (shogiObj: any) => {
  const TOTAL_PIECES: Record<string, number> = { FU: 18, KY: 4, KE: 4, GI: 4, KI: 4, KA: 2, HI: 2 };
  const counts: Record<string, number> = { FU: 0, KY: 0, KE: 0, GI: 0, KI: 0, KA: 0, HI: 0 };

  for (let x = 1; x <= 9; x++) {
    for (let y = 1; y <= 9; y++) {
      const p = shogiObj.get(x, y);
      if (p) {
        let kind = p.kind;
        if (['TO', 'NY', 'NK', 'NG'].includes(kind)) {
          if (kind === 'TO') kind = 'FU';
          if (kind === 'NY') kind = 'KY';
          if (kind === 'NK') kind = 'KE';
          if (kind === 'NG') kind = 'GI';
        }
        if (kind === 'UM') kind = 'KA';
        if (kind === 'RY') kind = 'HI';
        if (counts[kind] !== undefined) counts[kind]++;
      }
    }
  }

  const senteHand = shogiObj.getHandsSummary(Color.Black);
  for (const kind in senteHand) {
    if (counts[kind] !== undefined) counts[kind] += senteHand[kind];
  }

  const goteHand = shogiObj.getHandsSummary(Color.White);
  for (const kind in goteHand) {
    while (shogiObj.getHandsSummary(Color.White)[kind] > 0) {
      shogiObj.popFromHand(kind, Color.White);
    }
  }

  for (const kind in TOTAL_PIECES) {
    const remaining = TOTAL_PIECES[kind] - counts[kind];
    for (let i = 0; i < remaining; i++) {
      shogiObj.pushToHand(new Piece('-' + kind));
    }
  }
};

export const attachAnswerImages = (probs: Problem[], imageMap: Record<string, string>): Problem[] => {
  if (!probs || !Array.isArray(probs)) return probs;
  return probs.map((prob, idx) => {
    let answerImageUrl = prob.answerImageUrl;
    if (!answerImageUrl && imageMap) {
      answerImageUrl = imageMap[`id_${prob.id}`] ||
                       (prob.title ? imageMap[`title_${prob.title}`] : undefined) ||
                       (prob.initialSfen ? imageMap[`sfen_${prob.initialSfen}`] : undefined) ||
                       imageMap[`idx_${idx}`];
    }
    return {
      ...prob,
      answerImageUrl
    };
  });
};

export const applyMoveToShogi = (shogiObj: any, move: Move) => {
  if (move.from) {
    shogiObj.move(move.from.x, move.from.y, move.to.x, move.to.y, move.promote);
  } else if (move.piece) {
    shogiObj.drop(move.to.x, move.to.y, move.piece);
  }
};

export const formatMovesToJapanese = (moves: Move[], initialSfen: string): string[] => {
  if (!moves || moves.length === 0) return [];
  const tempShogi = new Shogi();
  try {
    if (tempShogi.initializeFromSFENString) {
      tempShogi.initializeFromSFENString(initialSfen);
    } else if (tempShogi.initializeFromSFEN) {
      tempShogi.initializeFromSFEN(initialSfen);
    }
  } catch (e) {
    return moves.map((m, i) => `${i % 2 === 0 ? '▲' : '△'}${m.to.x}${m.to.y}`);
  }

  const KANJI_NUMS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const FULL_WIDTH_NUMS = ['', '１', '２', '３', '４', '５', '６', '７', '８', '９'];
  
  const result: string[] = [];
  let prevTo: Position | null = null;

  moves.forEach((move, index) => {
    const isSente = index % 2 === 0;
    const prefix = isSente ? '▲' : '△';
    
    let destStr = '';
    if (prevTo && prevTo.x === move.to.x && prevTo.y === move.to.y) {
      destStr = '同　';
    } else {
      destStr = `${FULL_WIDTH_NUMS[move.to.x] || move.to.x}${KANJI_NUMS[move.to.y] || move.to.y}`;
    }

    let pieceKind = '';
    if (move.from) {
      const piece = tempShogi.get(move.from.x, move.from.y);
      if (piece) pieceKind = piece.kind;
    } else if (move.piece) {
      pieceKind = move.piece;
    }

    const pieceName = PIECE_NAMES[pieceKind] || pieceKind || '駒';
    
    let actionStr = '';
    if (move.promote) {
      actionStr = '成';
    } else if (move.piece) {
      actionStr = '打';
    }

    result.push(`${prefix}${destStr}${pieceName}${actionStr}`);

    try {
      applyMoveToShogi(tempShogi, move);
    } catch (e) {}
    prevTo = move.to;
  });

  return result;
};

export const cloneShogi = (shogiObj: any) => {
  const newShogi = new Shogi();
  const sfen = shogiObj.toSFENString ? shogiObj.toSFENString(1) : shogiObj.toSFEN(1);
  if (newShogi.initializeFromSFENString) {
    newShogi.initializeFromSFENString(sfen);
  } else if (newShogi.initializeFromSFEN) {
    newShogi.initializeFromSFEN(sfen);
  }
  return newShogi;
};

export const compressImage = (file: File, maxWidth = 1200, maxHeight = 1200, quality = 0.82): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      if (!rawDataUrl) {
        resolve('');
        return;
      }
      try {
        const img = new Image();
        img.onload = () => {
          try {
            let width = img.width || 800;
            let height = img.height || 600;

            if (width > maxWidth || height > maxHeight) {
              if (width / height > maxWidth / maxHeight) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
              } else {
                width = Math.round((width * maxHeight) / height);
                height = maxHeight;
              }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(rawDataUrl);
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            const compressedUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(compressedUrl || rawDataUrl);
          } catch (e) {
            console.warn("Canvas compression error, using raw image:", e);
            resolve(rawDataUrl);
          }
        };
        img.onerror = (err) => {
          console.warn("Image load error in compressImage, using raw image:", err);
          resolve(rawDataUrl);
        };
        img.src = rawDataUrl;
      } catch (e) {
        console.warn("Image compression exception, using raw image:", e);
        resolve(rawDataUrl);
      }
    };
    reader.onerror = (err) => {
      console.error("FileReader error in compressImage:", err);
      resolve('');
    };
    reader.readAsDataURL(file);
  });
};

export const getLegalMoves = (currentShogi: any, color: Color): Move[] => {
  const legalMoves: Move[] = [];
  
  for (let x = 1; x <= 9; x++) {
    for (let y = 1; y <= 9; y++) {
      const boardPiece = currentShogi.get(x, y);
      if (boardPiece && boardPiece.color === color) {
        const pieceKind = boardPiece.kind;
        const pieceColor = boardPiece.color;
        const pseudoMoves = currentShogi.getMovesFrom(x, y);
        
        for (const pm of pseudoMoves) {
          const isPromotionZone = (c: Color, row: number) => c === Color.Black ? row <= 3 : row >= 7;
          const isPromoted = ["TO", "NY", "NK", "NG", "UM", "RY"].includes(pieceKind);
          const canPromote = !isPromoted && 
                             !['KI', 'OU', 'GY'].includes(pieceKind) &&
                             (isPromotionZone(pieceColor, y) || isPromotionZone(pieceColor, pm.to.y));
                             
          const mustPromote = canPromote && (
            (['FU', 'KY'].includes(pieceKind) && (pieceColor === Color.Black ? pm.to.y === 1 : pm.to.y === 9)) ||
            (pieceKind === 'KE' && (pieceColor === Color.Black ? pm.to.y <= 2 : pm.to.y >= 8))
          );

          if (!mustPromote) {
            const sfen1 = currentShogi.toSFENString(1);
            try {
              currentShogi.move(x, y, pm.to.x, pm.to.y, false);
              if (!currentShogi.isCheck(color)) {
                legalMoves.push({ from: { x, y }, to: { x: pm.to.x, y: pm.to.y }, promote: false });
              }
            } catch (e) {}
            if (currentShogi.initializeFromSFENString) {
              currentShogi.initializeFromSFENString(sfen1);
            } else {
              currentShogi.initializeFromSFEN(sfen1);
            }
          }

          if (canPromote || mustPromote) {
            const sfen2 = currentShogi.toSFENString(1);
            try {
              currentShogi.move(x, y, pm.to.x, pm.to.y, true);
              if (!currentShogi.isCheck(color)) {
                legalMoves.push({ from: { x, y }, to: { x: pm.to.x, y: pm.to.y }, promote: true });
              }
            } catch (e) {}
            if (currentShogi.initializeFromSFENString) {
              currentShogi.initializeFromSFENString(sfen2);
            } else {
              currentShogi.initializeFromSFEN(sfen2);
            }
          }
        }
      }
    }
  }

  const drops = currentShogi.getDropsBy(color);
  for (const drop of drops) {
    if (color === Color.Black) {
      if ((drop.kind === 'FU' || drop.kind === 'KY') && drop.to.y === 1) continue;
      if (drop.kind === 'KE' && drop.to.y <= 2) continue;
    } else {
      if ((drop.kind === 'FU' || drop.kind === 'KY') && drop.to.y === 9) continue;
      if (drop.kind === 'KE' && drop.to.y >= 8) continue;
    }

    if (drop.kind === 'FU') {
      let hasPawn = false;
      for (let y = 1; y <= 9; y++) {
        const p = currentShogi.get(drop.to.x, y);
        if (p && p.kind === 'FU' && p.color === color) {
          hasPawn = true;
          break;
        }
      }
      if (hasPawn) continue;
    }

    const sfen = currentShogi.toSFENString(1);
    try {
      currentShogi.drop(drop.to.x, drop.to.y, drop.kind);
      if (!currentShogi.isCheck(color)) {
        legalMoves.push({ to: { x: drop.to.x, y: drop.to.y }, piece: drop.kind });
      }
    } catch (e) {}
    if (currentShogi.initializeFromSFENString) {
      currentShogi.initializeFromSFENString(sfen);
    } else {
      currentShogi.initializeFromSFEN(sfen);
    }
  }

  return legalMoves;
};

export const findBestDefenderMove = (
  currentShogi: any,
  maxDepth: number,
  solvedAiMovesMap: Record<string, Move[]>,
  preferredAiMovesMap: Record<string, Move>
): { bestMove: Move | null, steps: number, mate: boolean, mateCount?: number, timeout?: boolean } => {
  const memo = new Map<string, { steps: number, mate: boolean, bestMove: Move | null, mateCount?: number, timeout?: boolean }>();
  const startTime = Date.now();
  const TIME_LIMIT_MS = 3000;

  function search(depth: number, isBlack: boolean): { steps: number, mate: boolean, bestMove: Move | null, mateCount?: number, timeout?: boolean } {
    if (Date.now() - startTime > TIME_LIMIT_MS) {
      return { steps: 0, mate: false, bestMove: null, mateCount: 0, timeout: true };
    }

    const sfen = currentShogi.toSFENString(1);
    const hash = `${sfen}-${depth}-${isBlack}`;
    if (memo.has(hash)) return memo.get(hash)!;

    if (depth === 0) {
      return { steps: 0, mate: false, bestMove: null, mateCount: 0 };
    }

    const color = isBlack ? Color.Black : Color.White;
    let legalMoves = getLegalMoves(currentShogi, color);

    if (!isBlack && depth === maxDepth) {
      const prefMove = preferredAiMovesMap[sfen];
      if (prefMove) {
        const isLegal = legalMoves.some(m => 
          m.from?.x === prefMove.from?.x && m.from?.y === prefMove.from?.y && m.to.x === prefMove.to.x && m.to.y === prefMove.to.y && m.piece === prefMove.piece && m.promote === prefMove.promote
        );
        if (isLegal) {
          return { steps: 1, mate: false, bestMove: prefMove, mateCount: 0, timeout: false };
        }
      }
    }

    const PIECE_VALUES: Record<string, number> = {
      FU: 1, KY: 3, KE: 4, GI: 6, KI: 7, KA: 10, HI: 12,
      TO: 7, NY: 7, NK: 7, NG: 7, UM: 12, RY: 14, OU: 1000
    };
    let goteKingPos = { x: 5, y: 1 };
    let senteKingPos = { x: 5, y: 9 };
    for (let x = 1; x <= 9; x++) {
      for (let y = 1; y <= 9; y++) {
        const p = currentShogi.get(x, y);
        if (p && p.kind === 'OU') {
          if (p.color === Color.White) goteKingPos = { x, y };
          else senteKingPos = { x, y };
        }
      }
    }

    const enemyKingPos = isBlack ? goteKingPos : senteKingPos;
    const myKingPos = isBlack ? senteKingPos : goteKingPos;

    legalMoves.sort((a, b) => {
      const scoreMove = (m: Move) => {
        let score = 0;
        if (m.from) {
          const captured = currentShogi.get(m.to.x, m.to.y);
          if (captured) score += (PIECE_VALUES[captured.kind] || 1) * 20;
          if (m.promote) score += 10;
          
          const piece = currentShogi.get(m.from.x, m.from.y);
          if (piece && !isBlack) {
            const distBefore = Math.abs(m.from.x - myKingPos.x) + Math.abs(m.from.y - myKingPos.y);
            const distAfter = Math.abs(m.to.x - myKingPos.x) + Math.abs(m.to.y - myKingPos.y);
            if (distAfter < distBefore) score += 5;
            if (piece.kind === 'OU') score += 15;
          } else if (piece && isBlack) {
             const distBefore = Math.abs(m.from.x - enemyKingPos.x) + Math.abs(m.from.y - enemyKingPos.y);
             const distAfter = Math.abs(m.to.x - enemyKingPos.x) + Math.abs(m.to.y - enemyKingPos.y);
             if (distAfter < distBefore) score += 5;
          }
        } else {
          score -= 10;
          const dropVal = PIECE_VALUES[m.piece!] || 1;
          score += dropVal;
          if (!isBlack) {
             const dist = Math.abs(m.to.x - myKingPos.x) + Math.abs(m.to.y - myKingPos.y);
             if (dist <= 2) score += 5;
          } else {
             const dist = Math.abs(m.to.x - enemyKingPos.x) + Math.abs(m.to.y - enemyKingPos.y);
             if (dist <= 2) score += 15;
          }
        }
        return score + Math.random() * 5;
      };
      return scoreMove(b) - scoreMove(a);
    });

    if (isBlack) {
      legalMoves = legalMoves.filter(m => {
        const s = currentShogi.toSFENString(1);
        applyMoveToShogi(currentShogi, m);
        const isCheck = currentShogi.isCheck(Color.White);
        if (currentShogi.initializeFromSFENString) {
          currentShogi.initializeFromSFENString(s);
        } else {
          currentShogi.initializeFromSFEN(s);
        }
        return isCheck;
      });

      if (legalMoves.length === 0) {
        const res = { steps: 0, mate: false, bestMove: null, mateCount: 0 };
        memo.set(hash, res);
        return res;
      }

      let bestSteps = Infinity;
      let bestMove: Move | null = null;
      let evaluatedBlackMoves = 0;
      let mateCount = 0;
      let timeout = false;

      for (const move of legalMoves) {
        if (Date.now() - startTime > TIME_LIMIT_MS) {
           timeout = true;
           break;
        }
        evaluatedBlackMoves++;
        
        if (move.piece === 'FU') {
           const s = currentShogi.toSFENString(1);
           applyMoveToShogi(currentShogi, move);
           const whiteMoves = getLegalMoves(currentShogi, Color.White);
           if (currentShogi.initializeFromSFENString) {
             currentShogi.initializeFromSFENString(s);
           } else {
             currentShogi.initializeFromSFEN(s);
           }
           if (whiteMoves.length === 0) {
             continue;
           }
        }

        const s = currentShogi.toSFENString(1);
        applyMoveToShogi(currentShogi, move);
        const res = search(depth - 1, false);
        if (currentShogi.initializeFromSFENString) {
          currentShogi.initializeFromSFENString(s);
        } else {
          currentShogi.initializeFromSFEN(s);
        }

        if (res.timeout) {
            timeout = true;
            break;
        }

        if (res.mate) {
          if (res.steps < bestSteps) {
            bestSteps = res.steps;
            bestMove = move;
            mateCount = 1;
          } else if (res.steps === bestSteps) {
            mateCount++;
          }
        }
      }

      const finalRes = bestMove ? { steps: bestSteps + 1, mate: true, bestMove, mateCount, timeout } : { steps: 0, mate: false, bestMove: null, mateCount: 0, timeout };
      memo.set(hash, finalRes);
      return finalRes;

    } else {
      if (legalMoves.length === 0) {
        const res = { steps: 0, mate: true, bestMove: null };
        memo.set(hash, res);
        return res;
      }

      let maxSteps = -1;
      let minMateCount = Infinity;
      let bestMoves: Move[] = [];
      let escapeMoves: Move[] = [];
      let timeout = false;

      for (const move of legalMoves) {
        if (Date.now() - startTime > TIME_LIMIT_MS) {
            timeout = true;
            break;
        }

        const s = currentShogi.toSFENString(1);
        applyMoveToShogi(currentShogi, move);
        const res = search(depth - 1, true);
        if (currentShogi.initializeFromSFENString) {
          currentShogi.initializeFromSFENString(s);
        } else {
          currentShogi.initializeFromSFEN(s);
        }

        if (res.timeout) {
           timeout = true;
           if (!res.mate) escapeMoves.push(move);
           break;
        }

        if (!res.mate) {
          escapeMoves.push(move);
        } else {
          const currentMateCount = res.mateCount || Infinity;
          if (res.steps > maxSteps) {
            maxSteps = res.steps;
            minMateCount = currentMateCount;
            bestMoves = [move];
          } else if (res.steps === maxSteps) {
            if (currentMateCount < minMateCount) {
              minMateCount = currentMateCount;
              bestMoves = [move];
            } else if (currentMateCount === minMateCount) {
              bestMoves.push(move);
            }
          }
        }
      }

      const sfenKey = currentShogi.toSFENString(1);
      const previousMoves = solvedAiMovesMap[sfenKey] || [];

      const PIECE_VALUES: Record<string, number> = {
        FU: 1, KY: 3, KE: 4, GI: 6, KI: 7, KA: 10, HI: 12,
        TO: 7, NY: 7, NK: 7, NG: 7, UM: 12, RY: 14, OU: 1000
      };

      const evaluateMoveOption = (m: Move) => {
         let score = 0;
         if (m.from) {
             const captured = currentShogi.get(m.to.x, m.to.y);
             if (captured) {
                score += (PIECE_VALUES[captured.kind] || 1) * 20;
             }
         }
         
         const usedCount = previousMoves.filter(pm => 
           m.from?.x === pm.from?.x && m.from?.y === pm.from?.y && m.to.x === pm.to.x && m.to.y === pm.to.y && m.piece === pm.piece && m.promote === pm.promote
         ).length;
         score -= usedCount * 1000;

         return score + Math.random();
      };

      if (escapeMoves.length > 0) {
        let bestEscape = escapeMoves[0];
        let bestScore = -Infinity;

        for (const m of escapeMoves) {
          const score = evaluateMoveOption(m);
          if (score > bestScore) {
            bestScore = score;
            bestEscape = m;
          }
        }

        const escapeRes = { steps: 0, mate: false, bestMove: bestEscape, timeout };
        memo.set(hash, escapeRes);
        return escapeRes;
      }

      let randomBest = null;
      if (bestMoves.length > 0) {
        let bestDoomedMove = bestMoves[0];
        let bestDoomedScore = -Infinity;

        for (const m of bestMoves) {
           const score = evaluateMoveOption(m);
           if (score > bestDoomedScore) {
               bestDoomedScore = score;
               bestDoomedMove = m;
           }
        }
        randomBest = bestDoomedMove;
      }

      const finalRes = { steps: maxSteps + 1, mate: true, bestMove: randomBest, timeout };
      memo.set(hash, finalRes);
      return finalRes;
    }
  }

  return search(maxDepth, false);
};

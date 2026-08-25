// game.js
let rows = 9, cols = 9, mineCount = 10;
let board = [], timerId, time = 0, minesLeft = mineCount;

const boardEl = document.getElementById('board');
const minesLeftEl = document.getElementById('mines-left');
const timerEl = document.getElementById('timer');

document.getElementById('restart').addEventListener('click', initGame);

function initGame() {
  // 重置状态
  clearInterval(timerId);
  time = 0; timerEl.textContent = time;
  boardEl.innerHTML = '';
  board = [];
  minesLeft = mineCount;
  minesLeftEl.textContent = minesLeft;
  // 设置网格布局
  boardEl.style.gridTemplateRows = `repeat(${rows}, 30px)`;
  boardEl.style.gridTemplateColumns = `repeat(${cols}, 30px)`;
  // 初始化 board 数据数组
  for (let r = 0; r < rows; r++) {
    board[r] = [];
    for (let c = 0; c < cols; c++) {
      board[r][c] = { mine: false, count: 0, revealed: false, flagged: false };
    }
  }
  // 随机放置地雷
  let placed = 0;
  while (placed < mineCount) {
    let r = Math.floor(Math.random() * rows);
    let c = Math.floor(Math.random() * cols);
    if (!board[r][c].mine) {
      board[r][c].mine = true;
      placed++;
      // 更新周围格子计数
      for (let dr=-1; dr<=1; dr++) {
        for (let dc=-1; dc<=1; dc++) {
          let nr = r+dr, nc = c+dc;
          if (nr>=0 && nr<rows && nc>=0 && nc<cols && !(dr===0 && dc===0)) {
            board[nr][nc].count++;
          }
        }
      }
    }
  }
  // 创建 DOM 格子
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let cell = document.createElement('div');
      cell.className = 'cell';
      cell.addEventListener('click', () => openCell(r, c));
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        toggleFlag(r, c);
      });
      boardEl.appendChild(cell);
    }
  }
}

// 打开格子
function openCell(r, c) {
  let cellData = board[r][c];
  let cellEl = boardEl.children[r*cols + c];
  if (cellData.revealed || cellData.flagged) return;
  // 首次点击开始计时
  if (time === 0) {
    timerId = setInterval(() => {
      time++; timerEl.textContent = time;
    }, 1000);
  }
  cellData.revealed = true;
  cellEl.classList.add('revealed');
  if (cellData.mine) {
    // 踩雷，游戏失败
    cellEl.textContent = '💣';
    gameOver(false);
    return;
  }
  // 显示周围雷数
  if (cellData.count > 0) {
    cellEl.textContent = cellData.count;
  } else {
    // 若周围无雷，递归展开相邻格子
    for (let dr=-1; dr<=1; dr++) {
      for (let dc=-1; dc<=1; dc++) {
        let nr = r+dr, nc = c+dc;
        if (nr>=0 && nr<rows && nc>=0 && nc<cols) {
          if (!(dr===0 && dc===0)) openCell(nr, nc);
        }
      }
    }
  }
  checkWin();
}

// 切换插旗状态
function toggleFlag(r, c) {
  let cellData = board[r][c];
  let cellEl = boardEl.children[r*cols + c];
  if (cellData.revealed) return;
  cellData.flagged = !cellData.flagged;
  if (cellData.flagged) {
    cellEl.textContent = '🚩';
    minesLeft--;
  } else {
    cellEl.textContent = '';
    minesLeft++;
  }
  minesLeftEl.textContent = minesLeft;
}

// 检查胜利条件
function checkWin() {
  let safeCount = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!board[r][c].mine && board[r][c].revealed) safeCount++;
    }
  }
  if (safeCount === rows*cols - mineCount) {
    gameOver(true);
  }
}

// 游戏结束处理
function gameOver(win) {
  clearInterval(timerId);
  // 显示所有地雷
  if (!win) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c].mine) {
          let cellEl = boardEl.children[r*cols + c];
          cellEl.textContent = '💣';
        }
      }
    }
    alert('游戏失败！');
  } else {
    alert('你赢了！用时 '+ time +' 秒');
  }
}

// 启动游戏
initGame();
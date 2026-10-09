import {buildRadiusNeighbors} from './engine.js';

export const chapters = [
  {id:0,label:'第一章',title:'熟悉的扫雷',description:'用数字建立对关系的信任。',color:'#58c6b1',modes:['normal']},
  {id:1,label:'第二章',title:'数字的另一面',description:'同一个数字，可以统计另一种对象。',color:'#b5d989',modes:['negative']},
  {id:2,label:'第三章',title:'轮廓里的证据',description:'用公开模板，把直觉变成证明。',color:'#d7b873',modes:['shape']},
  {id:3,label:'第四章',title:'概率是当前知识',description:'雷没有移动，改变的是我们知道多少。',color:'#b99ae5',modes:['probability']},
  {id:4,label:'综合章',title:'选择你的理解',description:'让线索的含义决定下一步。',color:'#eaad91',modes:['mixed']},
  {id:5,label:'向量扩展',title:'箭头之外',description:'方向指向雷簇中心，可以穿过安全格。',color:'#83bde1',modes:['vector']},
  {id:6,label:'空间扩展',title:'邻居由规则定义',description:'三维距离决定邻接，投影距离不能代替它。',color:'#98adc8',modes:['spatial']},
  {id:7,label:'第八章',title:'网页也是棋盘',description:'调查真实页面元素，用固定关系读懂最后一张棋盘。',color:'#e1bd8e',modes:['web']}
];

const id = (x,y) => `r${y+1}c${x+1}`;
const ids = cells => cells.map(([x,y]) => id(x,y));
function grid(size) {
  const nodes = [];
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) nodes.push({id:id(x,y),x,y});
  const neighbors = Object.fromEntries(nodes.map(node=>[node.id,nodes.filter(other=>other.id!==node.id && Math.abs(other.x-node.x)<=1 && Math.abs(other.y-node.y)<=1).map(other=>other.id)]));
  return {size,nodes,neighbors};
}
const LINE = {id:'line',label:'三格直线',cells:[[0,0],[1,0],[2,0]],rotations:[0,90,180,270],count:1};
const ELBOW = {id:'elbow',label:'三格 L 形',cells:[[0,0],[0,1],[1,1]],rotations:[0,90,180,270],count:1};
const normalRule = '已开数字统计棋盘内八方向的邻格雷数，不包含自己。角、边、内部的邻格数量分别为 3、5、8。雷位固定；笔记不是真实证据。';
const negativeRule = '数字统计全部安全邻格（包含已打开和未打开），等于有效邻格数减邻雷数。边界按实际邻格数计算。满安全数会展开；0 安全意味着邻格全是雷。';
const shapeRule = '全部雷恰好由规则卡中的图形模板覆盖。允许 0°／90°／180°／270° 旋转，不越界、不重叠、没有其他雷；所有合法摆放都参与候选。数字仍统计邻雷数。';
const probabilityRule = '规则卡目录是全部等权候选，雷位从开局起固定。p 是本格有雷概率；已开格的 q 是未知邻格期望雷数÷未知邻格数。无伤采样公开指定区域的真实雷数，删去不符的候选。标记不改变概率，采样不限，超过两次记为辅助。';
const vectorRule = '全部雷由固定、互不重叠的 2×2 雷簇组成，允许所有合法摆放。箭头指向欧氏距离最近的簇中心；八区各45°，边界顺时针归属。等距展示全部箭头，同向保留数量。仅注明的数字锚点额外显示邻雷数。';
function make(data) {
  const level = {...grid(data.size || 3),...data};
  level.mines = ids(data.mineCells || []);
  level.initial = ids(data.initialCells || []);
  level.totalMines = level.mines.length;
  delete level.mineCells; delete level.initialCells;
  return level;
}
function probability(data) {
  const level = make({...data,rule:probabilityRule});
  level.publicCandidates = data.candidateCells.map(ids);
  level.scanRegions = data.regions.map(([regionId,label,cells])=>({id:regionId,label,cells:ids(cells)}));
  delete level.candidateCells; delete level.regions;
  return level;
}
const square = (x,y) => [[x,y],[x+1,y],[x,y+1],[x+1,y+1]];
function vector(data) {
  const level = make({...data,mode:'vector',chapter:5,rule:vectorRule});
  level.meta = {...data.meta,clusterCount:level.totalMines/4,numberAnchors:ids(data.numberAnchorCells || [])};
  delete level.numberAnchorCells;
  return level;
}
function spatial(data,columns,layers,radius,special=false) {
  const nodes = [];
  for (let z=0;z<layers;z++) for (let y=0;y<2;y++) for (let x=0;x<columns;x++) nodes.push({id:`P${String(nodes.length+1).padStart(2,'0')}`,x,y,z:special && z===1 && x===0 && y===0 ? 1.4 : z*(special ? 1 : .8)});
  const level = {...data,mode:'spatial',chapter:6,nodes,neighbors:buildRadiusNeighbors(nodes,radius),totalMines:data.mines.length,meta:{...data.meta,radius},rule:`节点按三维欧氏距离不超过 R=${radius} 互为邻居，邻接固定、对称且不包含自己。旋转和分层只改变视图。数字统计真实邻雷数；选中节点可检查全部邻接线。`};
  return level;
}

function webLevel() {
  const elements = [
    ['brand','顶部品牌','web-brand'],
    ['hero-title','主标题','intro-title'],
    ['hero-copy','主标题说明','intro-copy'],
    ['intro-index','引导编号','intro-index'],
    ['intro-copy','引导说明','intro-note-copy'],
    ['explore','章节入口','explore-open'],
    ['level-title','关卡标题','level-title'],
    ['level-copy','关卡说明','level-description'],
    ['rule-title','规则标题','rule-title'],
    ['rule-copy','规则正文','rule-text'],
    ['context','上下文说明','context-text'],
    ['next','下一步入口','next-question'],
    ['footer-brand','页尾品牌','footer-brand'],
    ['source','源代码链接','source-link']
  ];
  // These coordinates are stable identifiers for tooling, not DOM positions.
  // Adjacency comes only from the published semantic edge list below.
  const nodes = elements.map(([id,label,domId],index)=>({id,label,domId,x:index%4,y:Math.floor(index/4)}));
  const graphEdges = [
    ['brand','hero-title'],
    ['brand','footer-brand'],
    ['hero-title','hero-copy'],
    ['hero-title','intro-index'],
    ['hero-copy','intro-copy'],
    ['intro-index','intro-copy'],
    ['intro-copy','explore'],
    ['explore','level-title'],
    ['level-title','level-copy'],
    ['level-copy','rule-title'],
    ['level-copy','context'],
    ['rule-title','rule-copy'],
    ['rule-copy','context'],
    ['context','next'],
    ['next','footer-brand'],
    ['footer-brand','source'],
    ['source','rule-copy']
  ];
  const neighbors = Object.fromEntries(nodes.map(node=>[node.id,[]]));
  for (const [a,b] of graphEdges) { neighbors[a].push(b); neighbors[b].push(a); }
  const graphRule = '本页公开的 17 条关系连接标题与说明、引导与入口、关卡与规则、上下文与下一步，以及顶部／页尾品牌和源代码依据。关系双向，不包含元素自己；只有具名邻居列表中的元素才相邻。页面滚动、换行、缩放、窗口大小和元素距离都不改变关系。';
  return {
    id:'W01',title:'棋盘之外，关系仍在',chapter:7,mode:'web',nodes,neighbors,
    mines:['hero-copy','intro-copy','level-copy'],totalMines:3,
    initial:['hero-title','intro-index','next'],
    description:'这次没有方格棋盘：页面的文字、标题和入口就是可调查元素。先选中一个元素查看邻居，再根据公开数字确认安全。',
    rule:'共有 14 个网页元素、3 雷。已调查元素的数字统计固定关系图中的邻雷数；0 表示全部具名邻居安全，可以展开。'+graphRule+' 标记是可撤销的笔记；调查才会公开事实，误判后仍可继续。',
    insight:'扫雷需要的是稳定关系和诚实线索；格子可以是一段文字、一个标题或一个网页入口。',
    hints:[
      '引导编号的 1 只连接主标题与引导说明。主标题已安全，因此引导说明有雷。下一步入口的 0 则保证上下文说明和页尾品牌都安全。',
      '调查上下文说明后，将它的 1 与主标题的 1、已经确定的引导说明共同对照：三份独立关系已经用完本页的 3 个雷名额。',
      '关卡标题只连接章节入口与关卡说明。先证明章节入口安全，再用新数字确认关卡说明；页尾品牌的 0 可以验证顶部品牌。'
    ],
    meta:{difficulty:'网页关系图',graphEdges,graphRule,initialCandidateCount:12}
  };
}

export const levels = [
  make({id:'01',title:'一个数字，一种关系',chapter:0,mode:'normal',size:3,mineCells:[[0,0]],initialCells:[[1,0],[2,1]],description:'观察右侧的 0：它承诺周围没有雷。',rule:normalRule,insight:'数字不是这一格的危险等级，而是周围雷的数量。',hints:['先找 0，再看它的全部邻格。'],meta:{difficulty:'入门'}}),
  make({id:'02',title:'边界也有自己的数量',chapter:0,mode:'normal',size:4,mineCells:[[0,0],[2,1],[3,3]],initialCells:[[1,0],[0,2],[3,0]],description:'角落只有三个邻格；先用已知安全格缩小范围。',rule:normalRule,insight:'相同数字放在不同位置，约束的是不同数量的邻格。',hints:['边角线索也可靠，但它的邻域比内部小。'],meta:{difficulty:'基础'}}),
  make({id:'03',title:'两条线索的交集',chapter:0,mode:'normal',size:5,mineCells:[[0,0],[3,0],[1,2],[4,3]],initialCells:[[1,0],[2,1],[0,4],[4,1]],description:'单看一条线索可能不够，把重叠的邻域一起考虑。',rule:normalRule,insight:'两条含糊的线索，联合后可以产生确定的安全步。',hints:['比较两个相邻已开格，它们的共同邻格可以消去。'],meta:{difficulty:'联合推理'}}),
  make({id:'04',title:'数字 7，可以是好消息',chapter:1,mode:'negative',size:3,mineCells:[[0,0]],initialCells:[[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2]],views:['normal','negative'],description:'同一张小盘翻面：位置与事实没变，数字开始统计安全。',rule:negativeRule,insight:'中心的 1 雷和 7 安全，是同一个事实的两种表达。',hints:['左边中格有 5 个邻格，其中 4 个已经安全。它的安全数恰好是 4。'],meta:{difficulty:'认知翻面'}}),
  make({id:'05',title:'先标记你相信的安全',chapter:1,mode:'negative',size:4,mineCells:[[0,1],[2,0],[3,2]],initialCells:[[0,3],[1,1],[3,0]],description:'默认笔记变为安全勾；打开才会确认自己的判断。',rule:negativeRule,insight:'安全勾是推理草稿，不能让一个格子自动变安全。',hints:['找安全数等于邻格总数的线索；其邻域全部安全。'],meta:{difficulty:'安全标记'}}),
  make({id:'06',title:'角落没有第八个邻居',chapter:1,mode:'negative',size:4,mineCells:[[0,0],[3,0],[1,2]],initialCells:[[0,3],[3,3],[1,0]],description:'先读邻格总数，再判断安全数字够不够覆盖它们。',rule:negativeRule,insight:'角落的 3 安全就是全安全，无需等待一个不存在的 8。',hints:['角落的安全数若为 3，三位邻居都安全。'],meta:{difficulty:'边界迁移'}}),
  make({id:'07',title:'用另一面完成清盘',chapter:1,mode:'negative',size:5,mineCells:[[1,0],[3,1],[0,3],[3,4]],initialCells:[[0,0],[2,2],[4,4],[4,0],[3,0]],description:'独立应用安全计数，比较重叠邻域里的剩余安全名额。',rule:negativeRule,insight:'先问数字数的是什么，再决定它意味着哪一步。',hints:['安全数包含已开格。扣去已经安全的邻格，才得到还需找到的安全名额。'],meta:{difficulty:'独立负形'}}),
  make({id:'08',title:'雷也可以是一条线',chapter:2,mode:'shape',size:4,mineCells:[[1,1],[2,1],[3,1]],initialCells:[[0,0],[0,2],[2,3]],templates:[LINE],description:'本关只有一条三格直线，没有散落在其他地方的雷。',rule:shapeRule,insight:'一个图形规则，可以约束数字没有覆盖的远处格子。',hints:['模板必须完整放进棋盘，不能把一条线拆成三个独立雷。'],meta:{difficulty:'模板入门'}}),
  make({id:'09',title:'转一下，还是同一条规则',chapter:2,mode:'shape',size:4,mineCells:[[2,0],[2,1],[2,2]],initialCells:[[0,0],[3,3],[1,2]],templates:[LINE],description:'直线可以横放，也可以竖放；用数字排除方向。',rule:shapeRule,insight:'允许的旋转是公开规则，朝向不需要靠猜。',hints:['三格直线的 180° 不会产生新形状，实际只有横、竖两种朝向。'],meta:{difficulty:'旋转'}}),
  make({id:'10',title:'L 形的四个方向',chapter:2,mode:'shape',size:5,mineCells:[[2,1],[2,2],[3,2]],initialCells:[[0,0],[4,0],[1,2]],templates:[ELBOW],description:'恰好一个三格 L 形，四种直角旋转都合法。',rule:shapeRule,insight:'轮廓提出假设，已开数字负责检验。',hints:['检查 L 的拐点位置：它必须由两个相邻的臂组成，三雷不能成直线。'],meta:{difficulty:'轮廓约束'}}),
  make({id:'11',title:'两块轮廓，一片安全空间',chapter:2,mode:'shape',size:5,mineCells:[[0,1],[1,1],[2,1],[3,3],[3,4],[4,4]],initialCells:[[0,0],[4,0],[2,3]],templates:[LINE,ELBOW],description:'一条直线与一个 L 互不重叠，试着同时观察它们留下的空白。',rule:shapeRule,insight:'雷的轮廓和安全空间，是同一个布局的两面。',hints:['两块模板都必须存在；符合一个模板的摆放，也可能让另一个无处可放。'],meta:{difficulty:'双模板'}}),
  make({id:'12',title:'局部不够，整体来证明',chapter:2,mode:'shape',size:5,mineCells:[[1,0],[1,1],[1,2],[3,2],[3,3],[4,3]],initialCells:[[0,0],[4,4],[2,2]],templates:[LINE,ELBOW],description:'不要把每一格孤立地当成雷候选，完整摆放才能成立。',rule:shapeRule,insight:'整体约束能排除局部数字仍允许的答案。',hints:['保留同时满足全部数字与两块模板的摆放，再找每一种摆放都安全的格子。'],meta:{difficulty:'整体排除'}}),
  probability({id:'13',title:'两个可能世界',chapter:3,mode:'probability',size:3,mineCells:[[2,2]],initialCells:[[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2]],candidateCells:[[[0,0]],[[2,2]]],regions:[['a','左上单格',[[0,0]]],['d','右下单格',[[2,2]]]],description:'两个布局都符合现有证据，采样会告诉你哪一个仍可能。',insight:'50% 表示两个可能世界还未分清，不意味着雷会移动。',hints:['先无伤采样任意一个角落，再看候选目录怎样变化。'],meta:{difficulty:'两个候选',worstScanDepth:1}}),
  probability({id:'14',title:'分母也会改变',chapter:3,mode:'probability',size:3,mineCells:[[2,0],[2,2]],initialCells:[[1,0],[0,1],[1,1],[2,1],[1,2]],candidateCells:[[[0,0],[2,0]],[[0,0],[0,2]],[[2,0],[2,2]],[[0,2],[2,2]]],regions:[['a','A 左上',[[0,0]]],['b','B 右上',[[2,0]]],['c','C 左下',[[0,2]]],['d','D 右下',[[2,2]]]],description:'中心本身安全；它的百分比描述周围尚未确认的邻格。',insight:'新证据与未知邻格数量，都会改变平均雷密度。',hints:['采样 A 后，观察中心 q 的分子、分母与本格风险 p。'],meta:{difficulty:'条件概率',worstScanDepth:2}}),
  probability({id:'15',title:'低风险，还是高信息量',chapter:3,mode:'probability',size:3,mineCells:[[2,0],[2,1],[2,2]],initialCells:[[1,0],[1,1],[1,2]],candidateCells:[[[0,0],[2,0],[0,1]],[[0,0],[0,2],[2,1]],[[2,0],[2,2],[2,1]],[[0,2],[2,2],[2,1]]],regions:[['a','A 左上：两种结果',[[0,0]]],['b','B 右上：两种结果',[[2,0]]],['e','E 左中：低风险',[[0,1]]],['f','F 右中',[[2,1]]],['left','左列整体',[[0,0],[0,1],[0,2]]],['top','上排两个角',[[0,0],[2,0]]]],description:'低风险格未必最能区分候选；查看采样的可能结果分支。',insight:'采样不伤人，选择信息量高的位置比选择低风险更有意义。',hints:['比较 E 的 1／3 分支和 A 的 2／2 分支。采样结果还未出现前，它们都只是可能性。'],meta:{difficulty:'信息选择',worstScanDepth:2}}),
  probability({id:'16',title:'需要更多证据时',chapter:3,mode:'probability',size:3,mineCells:[[2,0],[0,2]],initialCells:[[1,0],[0,1],[1,1],[2,1],[1,2]],candidateCells:[[[0,0],[2,0]],[[0,0],[0,2]],[[0,0],[2,2]],[[2,0],[0,2]],[[2,0],[2,2]],[[0,2],[2,2]]],regions:[['top','上方两角',[[0,0],[2,0]]],['left','左侧两角',[[0,0],[0,2]]],['a','A 左上单格',[[0,0]]],['b','B 右上单格',[[2,0]]],['c','C 左下单格',[[0,2]]],['d','D 右下单格',[[2,2]]]],description:'有些结果两次就够，有些需要第三次。追加采样仍能无误判完成。',insight:'工具预算不能改变事实，也不应该迫使你猜。',hints:['整体采样可能一次得到 0、1、2 三种计数；若仍有两个候选，追加单格采样。'],meta:{difficulty:'区域采样',worstScanDepth:3}}),
  make({id:'17',title:'让同一个事实换面',chapter:4,mode:'mixed',size:5,mineCells:[[1,2],[2,2],[3,2]],initialCells:[[0,0],[4,4],[1,1]],templates:[LINE],views:['normal','negative'],description:'图形规则保持有效，自由切换雷数与安全数，挑你更容易读懂的一面。',rule:shapeRule+' 普通／安全计数可随时切换，只改变表达，不改变证据。',insight:'表达可以切换，已经知道的事实不能丢。',hints:['切换前后同一格的两数之和等于邻格总数；三格直线的整体限制一直存在。'],meta:{difficulty:'计数与模板'}}),
  probability({id:'18',title:'选择适合的问题',chapter:4,mode:'mixed',size:4,mineCells:[[0,2],[0,3],[1,3]],initialCells:[[1,1],[2,1],[1,2],[2,2]],candidateCells:[[[0,0],[1,0],[0,1]],[[2,0],[3,0],[3,1]],[[0,2],[0,3],[1,3]],[[3,2],[2,3],[3,3]]],regions:[['top','上半棋盘',[[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1]]],['left','左半棋盘',[[0,0],[1,0],[0,1],[1,1],[0,2],[1,2],[0,3],[1,3]]],['nw','左上四格',[[0,0],[1,0],[0,1],[1,1]]],['se','右下四格',[[2,2],[3,2],[2,3],[3,3]]]],description:'目录里的四个 L 形都可能。用区域采样，而不是逐格试探，收束最后的布局。',insight:'先明确哪些约束公开，再为缺少的信息选择工具。',hints:['上半与左半分别把四个 L 布局分为 2／2，组合两次结果就能辨别。'],meta:{difficulty:'图形候选与扫描',worstScanDepth:2}}),
  vector({id:'V01',title:'箭头指向中心',size:4,mineCells:square(2,0),initialCells:[[0,3],[2,3]],numberAnchorCells:[[0,3]],description:'本关有一个 2×2 雷簇。箭头指向它的中心，而不是相邻格。',insight:'方向是整体关系，不能直接把下一格标成雷。',hints:['先用一个雷簇的公开形状筛选，再比较两个已开箭头。'],meta:{difficulty:'方向入门'}}),
  vector({id:'V02',title:'穿过安全格的箭头',size:5,mineCells:square(2,0),initialCells:[[0,4],[1,3],[4,4]],numberAnchorCells:[[0,4]],description:'沿箭头方向会经过安全格；确认沿途空间，不要把射线都当成雷。',insight:'箭头可以跨过多个安全格，直到远处雷群的中心。',hints:['箭头约束的是簇中心在哪个45°方向区间；途中格子是否安全还要看全部候选。'],meta:{difficulty:'方向反例'}}),
  vector({id:'V03',title:'一样近，就一起显示',size:6,mineCells:[...square(0,0),...square(3,0)],initialCells:[[2,4]],numberAnchorCells:[[2,4]],description:'两个固定雷簇；中线锚点到两个中心一样近，会同时给出箭头。',insight:'平局不是错误线索；方向与数字锚点可以共同证明安全。',hints:['中线上的两支箭头代表两簇等距，不能只选其中一支来推理。'],meta:{difficulty:'平局与联合推理'}}),
  spatial({id:'S01',title:'重叠投影，分开的邻居',titleShort:'半径邻接',mines:['P02','P10'],initial:['P01','P06'],description:'P01 与 P07 投影很近，但三维距离超过半径；切换深度看它们。',insight:'屏幕上靠近，不等于三维规则中的邻居。',hints:['选中 P01 检查真实邻接线；它与 P07 不相邻。'],meta:{difficulty:'12 节点'}},3,2,1.12,true),
  spatial({id:'S02',title:'前后层也可以相邻',mines:['P03','P09','P15'],initial:['P01','P08','P16'],description:'相隔前后层的节点，若三维距离在半径内，仍然互为邻居。',insight:'邻接可以跨层，视图的分组不改变数字。',hints:['z 相差 0.8、x/y 相同的两节点相邻；同时查看它们各自的平面邻居。'],meta:{difficulty:'16 节点'}},4,2,1.05),
  spatial({id:'S03',title:'回到数字，换了邻居',mines:['P02','P08','P14','P20'],initial:['P01','P05','P11','P16'],description:'用固定半径图完成空间清盘。现在你知道：数字可靠，但邻居需要先定义。',insight:'认知被打破后，关系仍然诚实；你学会的是重新读懂它。',hints:['两个节点的邻域可能重叠；在三维图上也能使用第一章的联合约束。'],meta:{difficulty:'20 节点'}},5,2,1.05),
  webLevel()
];

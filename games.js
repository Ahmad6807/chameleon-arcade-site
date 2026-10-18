(() => {
  'use strict';
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function arcadeResult(game,outcome,details={}) { window.dispatchEvent(new CustomEvent('arcade:result',{detail:{game,outcome,details}})); }
  const announce = (id, message, tone='') => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.dataset.tone = tone;
  };

  // Accessible tab set: keyboard arrows move focus and activate the selected challenge.
  const tabs = $$('.suite-tab');
  const panes = $$('.suite-pane');
  function activateTab(tab, moveFocus=false) {
    tabs.forEach(t => {
      const active = t === tab;
      t.setAttribute('aria-selected', String(active));
      t.tabIndex = active ? 0 : -1;
    });
    panes.forEach(p => { p.hidden = p.id !== `${tab.dataset.gameSelect}Panel`; });
    if (moveFocus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', e => {
      let next = index;
      if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      else return;
      e.preventDefault(); activateTab(tabs[next], true);
    });
  });

  // 1. HEX — 11×11 connection board. The Blue opponent searches with alpha-beta
  // pruning and a weighted shortest-connection (0–1 Dijkstra) evaluation.
  const HEX_N = 11;
  const hexBoard = $('#hexBoard');
  const hexStatus = $('#hexStatus');
  const hex = { board: Array(HEX_N*HEX_N).fill(0), player: 1, ai: true, busy: false, over: false, history: [], redo: [], timer: 0 };
  const hIndex = (r,c) => r*HEX_N+c;
  const hRC = i => [Math.floor(i/HEX_N), i%HEX_N];
  function hNeighbors(i) {
    const [r,c] = hRC(i);
    return [[r-1,c],[r-1,c+1],[r,c-1],[r,c+1],[r+1,c-1],[r+1,c]]
      .filter(([y,x]) => y>=0 && y<HEX_N && x>=0 && x<HEX_N).map(([y,x]) => hIndex(y,x));
  }
  function hWinner(board) {
    for (const player of [1,2]) {
      const queue = [], seen = new Uint8Array(board.length);
      for (let k=0;k<HEX_N;k++) {
        const i = player===1 ? hIndex(k,0) : hIndex(0,k);
        if (board[i]===player) { queue.push(i); seen[i]=1; }
      }
      for (let head=0;head<queue.length;head++) {
        const i=queue[head], [r,c]=hRC(i);
        if ((player===1 && c===HEX_N-1) || (player===2 && r===HEX_N-1)) return player;
        for (const n of hNeighbors(i)) if (!seen[n] && board[n]===player) { seen[n]=1; queue.push(n); }
      }
    }
    return 0;
  }
  function hDistance(board, player) {
    const dist = new Float64Array(board.length); dist.fill(Infinity);
    const heap = [];
    const push = (node) => { heap.push(node); let i=heap.length-1; while(i>0){const p=(i-1)>>1;if(heap[p].d<=node.d)break;heap[i]=heap[p];i=p;}heap[i]=node; };
    const pop = () => { const first=heap[0], last=heap.pop(); if(heap.length){let i=0;while(true){let c=i*2+1;if(c>=heap.length)break;if(c+1<heap.length&&heap[c+1].d<heap[c].d)c++;if(heap[c].d>=last.d)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first; };
    const starts=[];
    for(let k=0;k<HEX_N;k++) starts.push(player===1?hIndex(k,0):hIndex(0,k));
    for(const i of starts){ if(board[i]===3-player)continue; const d=board[i]===player?0:1; if(d<dist[i]){dist[i]=d;push({i,d});} }
    while(heap.length){const cur=pop();if(cur.d!==dist[cur.i])continue;for(const n of hNeighbors(cur.i)){if(board[n]===3-player)continue;const nd=cur.d+(board[n]===player?0:1);if(nd<dist[n]){dist[n]=nd;push({i:n,d:nd});}}}
    let best=Infinity;
    for(let k=0;k<HEX_N;k++){const i=player===1?hIndex(k,HEX_N-1):hIndex(HEX_N-1,k);if(dist[i]<best)best=dist[i];}
    return best;
  }
  function hEvaluate(board, depth=0) {
    const win=hWinner(board); if(win===1)return 5000+depth; if(win===2)return -5000-depth;
    const red=hDistance(board,1), blue=hDistance(board,2);
    return blue-red;
  }
  function hCandidateMoves(board, limit) {
    const candidates=new Set();
    for(let i=0;i<board.length;i++) if(board[i]) for(const n of hNeighbors(i)) if(!board[n]) candidates.add(n);
    if(!candidates.size){const first=board.indexOf(0);if(first>=0)candidates.add(first);}
    const ordered=[...candidates].sort((a,b)=>{
      const [ar,ac]=hRC(a),[br,bc]=hRC(b);
      const centerA=Math.abs(ar-5)+Math.abs(ac-5), centerB=Math.abs(br-5)+Math.abs(bc-5);
      const ownA=hNeighbors(a).filter(n=>board[n]===1).length, oppA=hNeighbors(a).filter(n=>board[n]===2).length;
      const ownB=hNeighbors(b).filter(n=>board[n]===1).length, oppB=hNeighbors(b).filter(n=>board[n]===2).length;
      return (centerA-ownA*.28-oppA*.12)-(centerB-ownB*.28-oppB*.12);
    });
    return ordered.slice(0,limit);
  }
  function hSearch(board, player, depth, alpha, beta) {
    const win=hWinner(board); if(win)return win===1?5000+depth:-5000-depth;
    if(depth<=0)return hEvaluate(board);
    const moves=hCandidateMoves(board, depth===1?7:9);
    if(!moves.length)return hEvaluate(board);
    if(player===1){let value=-Infinity;for(const i of moves){board[i]=1;value=Math.max(value,hSearch(board,2,depth-1,alpha,beta));board[i]=0;alpha=Math.max(alpha,value);if(beta<=alpha)break;}return value;}
    let value=Infinity;for(const i of moves){board[i]=2;value=Math.min(value,hSearch(board,1,depth-1,alpha,beta));board[i]=0;beta=Math.min(beta,value);if(beta<=alpha)break;}return value;
  }
  function hBestMove(board, depth) {
    const moves=hCandidateMoves(board,14); let best=moves[0]??hIndex(5,5), bestScore=Infinity, beta=Infinity;
    for(const i of moves){board[i]=2;const score=hSearch(board,1,depth,-Infinity,beta);board[i]=0;if(score<bestScore){bestScore=score;best=i;}beta=Math.min(beta,bestScore);}
    return best;
  }
  function hSnapshot(){hex.history.push({board:hex.board.slice(),player:hex.player,over:hex.over});hex.redo=[];if(hex.history.length>80)hex.history.shift();}
  function hRender(){
    if(!hexBoard)return; hexBoard.replaceChildren();
    for(let i=0;i<hex.board.length;i++){
      const [r,c]=hRC(i), stone=hex.board[i], b=document.createElement('button');
      b.type='button';b.className='hex-cell';b.dataset.index=String(i);b.setAttribute('role','gridcell');
      b.setAttribute('aria-pressed',String(!!stone));b.setAttribute('aria-label',`Row ${r+1}, column ${c+1}, ${stone===1?'Red stone':stone===2?'Blue stone':'empty'}. Red connects left to right; blue connects top to bottom.`);
      b.disabled=!!stone||hex.busy||hex.over||(hex.ai&&hex.player===2);
      if(stone){const s=document.createElement('span');s.className='hex-stone';s.dataset.color=stone===1?'red':'blue';s.setAttribute('aria-hidden','true');b.appendChild(s);}
      b.addEventListener('click',()=>hPlay(i));hexBoard.appendChild(b);
    }
    $('#hexMoveCount').textContent=String(hex.board.reduce((n,v)=>n+(v?1:0),0));
    $('#hexUndo').disabled=hex.busy||hex.history.length===0;$('#hexRedo').disabled=hex.busy||hex.redo.length===0;
    const turn=hex.over?'Round complete':hex.busy?'Blue is searching…':hex.ai&&hex.player===2?'Blue AI to move':`${hex.player===1?'Red':'Blue'} to move`;
    if(!hex.over)announce('hexStatus',`${turn}. ${hex.ai?'Nightmare search, 11 by 11 board.':'Local match.'}`,hex.busy?'warn':'');
  }
  function hFinish(player){if(hex.over)return;hex.over=true;hex.busy=false;clearTimeout(hex.timer);announce('hexStatus',`${player===1?'Red':'Blue'} connects both edges and wins.`,player===1?'win':'danger');arcadeResult('hex',hex.ai?(player===1?'win':'loss'):'completed',{winner:player===1?'Red':'Blue',mode:hex.ai?'ai':'local'});hRender();}
  function hPlay(i){
    if(hex.busy||hex.over||hex.board[i]||hex.ai&&hex.player===2)return;
    hSnapshot();hex.board[i]=hex.player;
    const won=hWinner(hex.board);if(won){hFinish(won);return;}
    hex.player=3-hex.player;hRender();
    if(hex.ai&&hex.player===2){hex.busy=true;hRender();hex.timer=window.setTimeout(()=>{
      if(hex.over||!hex.ai||hex.player!==2)return;
      const depth=Number($('#hexDepth')?.value)||2;
      const move=hBestMove(hex.board,depth);hSnapshot();hex.board[move]=2;
      if(hWinner(hex.board)){hFinish(2);return;}hex.player=1;hex.busy=false;hRender();
    },reducedMotion?80:460);}
  }
  function hReset(){clearTimeout(hex.timer);hex.board=Array(HEX_N*HEX_N).fill(0);hex.player=1;hex.busy=false;hex.over=false;hex.history=[];hex.redo=[];hRender();}
  $('#hexMode')?.addEventListener('click',e=>{const b=e.target.closest('[data-hex-mode]');if(!b)return;hex.ai=b.dataset.hexMode==='ai';$$('[data-hex-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));hReset();});
  $('#hexDepth')?.addEventListener('change',()=>{if(!hex.over)announce('hexStatus',`Search depth ${$('#hexDepth').value} selected. Blue will use alpha-beta pruning.`);});
  $('#hexReset')?.addEventListener('click',hReset);
  $('#hexUndo')?.addEventListener('click',()=>{if(hex.busy||!hex.history.length)return;const count=hex.ai&&hex.history.length>=2?2:1,current={board:hex.board.slice(),player:hex.player,over:hex.over},snapshots=[];for(let i=0;i<count;i++)snapshots.unshift(hex.history.pop());hex.redo.push({...current,snapshots});const snap=snapshots[0];hex.board=snap.board.slice();hex.player=snap.player;hex.over=snap.over;hRender();announce('hexStatus','Last turn undone. Use Redo turn to restore it.');});
  $('#hexRedo')?.addEventListener('click',()=>{if(hex.busy||!hex.redo.length)return;const snap=hex.redo.pop();hex.history.push(...snap.snapshots);hex.board=snap.board.slice();hex.player=snap.player;hex.over=snap.over;hRender();announce('hexStatus','Turn restored. Red connects left-to-right; blue connects top-to-bottom.');});
  hRender();

  // 2. NETWORK SABOTEUR — AC-3 prunes the per-column row domains; backtracking
  // with forward checking finds a surviving end-to-end route after every firewall.
  const NET_COLS=9, NET_ROWS=5, netBoard=$('#networkBoard');
  const net={blocked:new Set(),route:null,col:0,row:2,turns:0,selected:-1,over:false,critical:0,criticalGoal:4,log:[]};
  const nId=(c,r)=>r*NET_COLS+c;
  const nCapacity=(c,r)=>1+((c*7+r*5)%3);
  function cspRoute(blocked=net.blocked,startCol=net.col,startRow=net.row){
    const cols=Array.from({length:NET_COLS-startCol},(_,i)=>startCol+i);
    if(!cols.length)return null;
    let domains=cols.map(c=>c===startCol?[startRow]:c===NET_COLS-1?[2]:Array.from({length:NET_ROWS},(_,r)=>r).filter(r=>!blocked.has(nId(c,r))));
    if(domains.some((d,i)=>d.length===0||blocked.has(nId(cols[i],d[0]))))return null;
    function propagate(ds){
      const q=[];for(let i=0;i<ds.length-1;i++){q.push([i,i+1],[i+1,i]);}
      let at=0;
      while(at<q.length){const [i,j]=q[at++],before=ds[i].length;ds[i]=ds[i].filter(v=>ds[j].some(w=>Math.abs(v-w)<=1));if(!ds[i].length)return false;
        if(ds[i].length!==before){for(const k of [i-1,i+1])if(k>=0&&k<ds.length&&k!==j)q.push([k,i]);}}
      return true;
    }
    function search(ds){
      if(!propagate(ds))return null;
      let pick=-1,best=Infinity;for(let i=0;i<ds.length;i++)if(ds[i].length>1&&ds[i].length<best){best=ds[i].length;pick=i;}
      if(pick<0)return ds.map(d=>d[0]);
      for(const value of ds[pick]){const next=ds.map(d=>d.slice());next[pick]=[value];const found=search(next);if(found)return found;}
      return null;
    }
    const answer=search(domains);
    return answer?{cols,rows:answer}:null;
  }
  function nLog(text){net.log.unshift(text);net.log=net.log.slice(0,5);const list=$('#networkLog');if(list){list.replaceChildren();for(const line of net.log){const li=document.createElement('li');li.textContent=line;list.appendChild(li);}}}
  function nRender(){
    if(!netBoard)return;netBoard.replaceChildren();const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','network-edges');svg.setAttribute('viewBox','0 0 900 500');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
    for(let c=0;c<NET_COLS-1;c++)for(let r=0;r<NET_ROWS;r++)for(let nr=Math.max(0,r-1);nr<=Math.min(NET_ROWS-1,r+1);nr++){
      const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',`M ${50+c*100} ${50+r*100} L ${50+(c+1)*100} ${50+nr*100}`);p.setAttribute('class','network-edge');svg.appendChild(p);
    }
    const route=net.route;
    if(route)for(let j=0;j<route.cols.length-1;j++){
      const c=route.cols[j],r=route.rows[j],nc=route.cols[j+1],nr=route.rows[j+1];
      const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',`M ${50+c*100} ${50+r*100} L ${50+nc*100} ${50+nr*100}`);p.setAttribute('class',`network-edge route${c<net.col?' packet':''}`);svg.appendChild(p);
    }
    netBoard.appendChild(svg);
    for(let c=0;c<NET_COLS;c++)for(let r=0;r<NET_ROWS;r++){
      const id=nId(c,r),b=document.createElement('button');b.type='button';b.className='network-node';b.style.gridColumn=String(c+1);b.style.gridRow=String(r+1);b.dataset.node=String(id);
      const blocked=net.blocked.has(id),isRoute=route&&route.cols.some((x,j)=>x===c&&route.rows[j]===r);
      if(blocked)b.classList.add('is-blocked');if(isRoute)b.classList.add('on-route');if(c===net.col&&r===net.row)b.classList.add('is-current');if(c===0||c===NET_COLS-1)b.classList.add('is-endpoint');
      b.textContent=blocked?'×':c===net.col&&r===net.row?'P':c===NET_COLS-1&&r===2?'D':String(nCapacity(c,r));
      b.setAttribute('aria-pressed',String(net.selected===id));b.setAttribute('aria-label',`${c===net.col&&r===net.row?'Packet at ':''}column ${c+1}, lane ${r+1}${blocked?', firewalled':isRoute?', on active route':''}${c===NET_COLS-1&&r===2?', delivery server':''}, capacity ${nCapacity(c,r)}`);
      b.disabled=net.over||blocked||c<=net.col||c===NET_COLS-1;
      b.addEventListener('click',()=>{if(net.over||b.disabled)return;net.selected=id;announce('networkStatus',`Relay selected: column ${c+1}, lane ${r+1}. Install firewall to test whether the packet can reroute.`,'warn');nRender();});
      netBoard.appendChild(b);
    }
    $('#networkTurns').textContent=String(Math.max(0,NET_COLS-1-net.col));
    $('#networkBlockedCount').textContent=String(net.blocked.size);$('#networkReroutes').textContent=`${net.critical}/${net.criticalGoal}`;
  }
  function nFinish(message,win){if(net.over)return;net.over=true;net.route=null;announce('networkStatus',message,win?'win':'danger');arcadeResult('network',win?'win':'loss',{critical:net.critical,turns:net.turns});nRender();}
  function nReset(){net.blocked=new Set();net.route=cspRoute(net.blocked,0,2);net.col=0;net.row=2;net.turns=0;net.selected=-1;net.over=false;net.critical=0;net.log=[];nLog('AC-3 initialized 9 route variables; packet starts at lane 3.');announce('networkStatus','Hit four capacity-3 relays on the active route before delivery. A firewall that leaves no valid route is rejected.');nRender();}
  $('#networkFirewall')?.addEventListener('click',()=>{
    if(net.over||net.selected<0){announce('networkStatus','Select an unblocked relay ahead of the packet first.','warn');return;}
    const [r,c]=[Math.floor(net.selected/NET_COLS),net.selected%NET_COLS];
    if(c<=net.col){announce('networkStatus','A firewall cannot be placed on or behind the live packet.','warn');return;}
    const active=net.route&&net.route.cols.some((x,j)=>x===c&&net.route.rows[j]===r),capacity=nCapacity(c,r),next=new Set(net.blocked);next.add(net.selected);const route=cspRoute(next,net.col,net.row);net.selected=-1;
    if(!route){nLog(`AC-3 rejected the firewall at column ${c+1}, lane ${r+1}; it would empty a route domain.`);announce('networkStatus','Defender rejected that firewall: it would leave an intermediate route domain empty. Choose a different relay.','danger');nRender();return;}
    net.blocked=next;net.route=route;
    if(active&&capacity===3){net.critical++;nLog(`Critical capacity-3 relay intercepted at column ${c+1}, lane ${r+1} (${net.critical}/${net.criticalGoal}).`);if(net.critical>=net.criticalGoal){nFinish('Saboteur wins — four critical relays were intercepted before delivery.',true);return;}}
    else nLog(`Firewall at column ${c+1}, lane ${r+1}; CSP forward checking found a detour${active?` (capacity ${capacity}; not a critical relay)`:''}.`);
    const step=route.rows.length>1?route.rows[1]:net.row;net.col++;net.row=step;net.turns++;
    if(net.col===NET_COLS-1){nLog('Packet reached the delivery server.');nFinish('Defender wins — the packet reached the server despite your firewall.',false);return;}
    net.route=cspRoute(net.blocked,net.col,net.row);announce('networkStatus',`Route survives. Packet advanced to column ${net.col+1}, lane ${net.row+1}; ${NET_COLS-1-net.col} moves remain.`);nRender();
  });
  $('#networkReset')?.addEventListener('click',nReset);
  nReset();

  // 3. EVOLUTIONARY MAZE RUNNER — tournament selection, single-point crossover,
  // continuous mutation, collision-aware fitness, and a live best/mean history.
  const GA_W=800,GA_H=400,GA_STEPS=126,GA_GENES=6;
  const gaCanvas=$('#gaCanvas'),gaCtx=gaCanvas?.getContext('2d'),chart=$('#gaChart'),chartCtx=chart?.getContext('2d');
  let gaWalls=[];
  const ga={population:[],generation:0,history:[],running:false,timer:0,best:null,average:0,solved:false};
  const gaStart=$('#gaStart'),gaPop=$('#gaPopulation'),gaMutation=$('#gaMutation'),gaSpeed=$('#gaSpeed');
  function gaRandGene(i){return i===0?.25+Math.random()*1.25:Math.random()*2-1;}
  function gaRandomGenome(){return Array.from({length:GA_GENES},(_,i)=>gaRandGene(i));}
  function gaBuildMaze(){const xs=[145,270,395,520,645],bases=[280,112,286,106,278],gap=76;gaWalls=[];xs.forEach((x,i)=>{const center=clamp(bases[i]+(Math.random()-.5)*44,95,305),top=center-gap/2;gaWalls.push({x,y:0,w:19,h:top},{x,y:top+gap,w:19,h:GA_H-(top+gap)});});}
  function gaReset(){clearTimeout(ga.timer);gaBuildMaze();ga.running=false;ga.generation=0;ga.history=[];ga.solved=false;ga.population=Array.from({length:Number(gaPop?.value)||48},()=>gaRandomGenome());if(gaStart)gaStart.textContent='Evolve';$('#gaGeneration').textContent='0';$('#gaFitness').textContent='—';$('#gaAverage').textContent='—';$('#gaMutValue').textContent=`${Math.round((Number(gaMutation?.value)||.12)*100)}%`;$('#gaPopulationValue').textContent=String(gaPop?.value||48);$('#gaSpeedValue').textContent=`${gaSpeed?.value||3}×`;ga.best=null;gaDraw();gaDrawChart();announce('gaStatus','A new gate layout and population are ready. Press Evolve to begin the selection cycle.');}
  function gaSense(x,y,angle,range=44){
    for(let d=6;d<=range;d+=6){const px=x+Math.cos(angle)*d,py=y+Math.sin(angle)*d;if(px<7||py<7||px>GA_W-7||py>GA_H-7||gaWalls.some(w=>px+5>w.x&&px-5<w.x+w.w&&py+5>w.y&&py-5<w.y+w.h))return d-6;}
    return range;
  }
  function gaHit(x,y){return x<8||y<8||x>GA_W-8||y>GA_H-8||gaWalls.some(w=>x+5>w.x&&x-5<w.x+w.w&&y+5>w.y&&y-5<w.y+w.h);}
  function gaAngleDiff(a,b){let d=(b-a+Math.PI*3)%(Math.PI*2)-Math.PI;return d;}
  function gaEval(genome){
    let x=28,y=200,angle=0,hits=0,trace=[[x,y]],arrived=false;
    for(let step=0;step<GA_STEPS;step++){
      const target=Math.atan2(200-y,770-x),diff=gaAngleDiff(angle,target);
      const left=gaSense(x,y,angle-.58),right=gaSense(x,y,angle+.58),front=gaSense(x,y,angle);
      const avoid=(right-left)/44*genome[1];
      const frontNudge=(1-front/44)*genome[2]*((step%2)?1:-1);
      const steering=diff*(.12+genome[0]*.2)+avoid*.48+frontNudge*.22+genome[3]*.025+genome[4]*.015;
      angle+=clamp(steering,-.38,.38);
      const nx=x+Math.cos(angle)*6,ny=y+Math.sin(angle)*6;
      if(gaHit(nx,ny)){hits++;angle+=genome[5]*.12;if(hits>=5)break;continue;}
      x=nx;y=ny;trace.push([x,y]);
      if(Math.hypot(770-x,200-y)<18){arrived=true;break;}
    }
    const distance=Math.hypot(770-x,200-y);
    const fitness=arrived?5000+trace.length:1500-distance*1.15-hits*32+trace.length*.4;
    return {x,y,trace,fitness,distance,arrived,hits};
  }
  function gaDraw(popResults=[]){
    if(!gaCtx)return;const c=gaCanvas;gaCtx.clearRect(0,0,GA_W,GA_H);
    const grad=gaCtx.createLinearGradient(0,0,0,GA_H);grad.addColorStop(0,'#0d3540');grad.addColorStop(1,'#071b25');gaCtx.fillStyle=grad;gaCtx.fillRect(0,0,GA_W,GA_H);
    gaCtx.strokeStyle='rgba(196,233,202,.045)';gaCtx.lineWidth=1;for(let x=0;x<GA_W;x+=40){gaCtx.beginPath();gaCtx.moveTo(x,0);gaCtx.lineTo(x,GA_H);gaCtx.stroke();}for(let y=0;y<GA_H;y+=40){gaCtx.beginPath();gaCtx.moveTo(0,y);gaCtx.lineTo(GA_W,y);gaCtx.stroke();}
    gaCtx.fillStyle='rgba(199,243,109,.13)';gaCtx.beginPath();gaCtx.arc(28,200,16,0,Math.PI*2);gaCtx.fill();
    gaCtx.fillStyle='rgba(134,201,255,.16)';gaCtx.beginPath();gaCtx.arc(770,200,22,0,Math.PI*2);gaCtx.fill();gaCtx.strokeStyle='#86c9ff';gaCtx.lineWidth=2;gaCtx.beginPath();gaCtx.arc(770,200,11,0,Math.PI*2);gaCtx.stroke();
    for(const w of gaWalls){gaCtx.fillStyle='#25443f';gaCtx.fillRect(w.x,w.y,w.w,w.h);gaCtx.fillStyle='rgba(199,243,109,.12)';gaCtx.fillRect(w.x,w.y,w.w,5);}
    const sorted=popResults.slice().sort((a,b)=>b.fitness-a.fitness);const visible=sorted.slice(0,Math.min(12,sorted.length));
    visible.slice(1).forEach((item,index)=>{gaCtx.beginPath();item.trace.forEach(([px,py],i)=>i?gaCtx.lineTo(px,py):gaCtx.moveTo(px,py));gaCtx.strokeStyle=`rgba(98,194,176,${.12+index*.018})`;gaCtx.lineWidth=1;gaCtx.stroke();});
    const best=visible[0]||ga.best;if(best){gaCtx.beginPath();best.trace.forEach(([px,py],i)=>i?gaCtx.lineTo(px,py):gaCtx.moveTo(px,py));gaCtx.strokeStyle='#c7f36d';gaCtx.lineWidth=3;gaCtx.shadowColor='rgba(199,243,109,.35)';gaCtx.shadowBlur=8;gaCtx.stroke();gaCtx.shadowBlur=0;}
    sorted.slice(0,Math.min(30,sorted.length)).forEach((item,i)=>{gaCtx.fillStyle=i===0?'#fff2a8':'rgba(134,201,255,.68)';gaCtx.beginPath();gaCtx.arc(item.x,item.y,i===0?5:2.7,0,Math.PI*2);gaCtx.fill();});
    gaCtx.fillStyle='#b5cbbb';gaCtx.font='700 12px ui-monospace,monospace';gaCtx.fillText('START',12,232);gaCtx.fillText('EXIT',748,238);
  }
  function gaDrawChart(){
    if(!chartCtx)return;const W=chart.width,H=chart.height;chartCtx.clearRect(0,0,W,H);chartCtx.fillStyle='#071b25';chartCtx.fillRect(0,0,W,H);chartCtx.strokeStyle='rgba(195,237,214,.1)';chartCtx.lineWidth=1;
    for(let i=1;i<4;i++){chartCtx.beginPath();chartCtx.moveTo(0,H*i/4);chartCtx.lineTo(W,H*i/4);chartCtx.stroke();}
    if(!ga.history.length){chartCtx.fillStyle='#92aa9f';chartCtx.font='13px system-ui';chartCtx.fillText('Fitness history appears after generation 1',14,H/2+4);return;}
    const max=5500,min=350;[['best','#c7f36d','best'],['average','#86c9ff','average']].forEach(([key,color])=>{chartCtx.beginPath();ga.history.forEach((p,i)=>{const x=12+(W-24)*(i/Math.max(1,ga.history.length-1)),y=H-10-(H-20)*clamp((p[key]-min)/(max-min),0,1);if(i)chartCtx.lineTo(x,y);else chartCtx.moveTo(x,y);});chartCtx.strokeStyle=color;chartCtx.lineWidth=key==='best'?2.6:1.8;chartCtx.stroke();});
  }
  function gaTournament(results){let best=results[Math.floor(Math.random()*results.length)];for(let i=0;i<3;i++){const test=results[Math.floor(Math.random()*results.length)];if(test.fitness>best.fitness)best=test;}return best.genome;}
  function gaNextPopulation(results){
    const size=Number(gaPop?.value)||48,rate=Number(gaMutation?.value)||.12,sorted=results.slice().sort((a,b)=>b.fitness-a.fitness),next=[];
    next.push(sorted[0].genome.slice());if(sorted[1])next.push(sorted[1].genome.slice());
    while(next.length<size){const a=gaTournament(sorted),b=gaTournament(sorted),cut=1+Math.floor(Math.random()*(GA_GENES-1));const child=Array.from({length:GA_GENES},(_,i)=>{let v=i<cut?a[i]:b[i];if(Math.random()<rate)v+= (Math.random()*2-1)*.45;return i===0?clamp(v,0,1.8):clamp(v,-1,1);});next.push(child);}
    return next;
  }
  function gaGeneration(){
    const results=ga.population.map(genome=>({...gaEval(genome),genome})).sort((a,b)=>b.fitness-a.fitness);if(!results.length)return;
    ga.generation++;ga.best=results[0];ga.average=results.reduce((s,x)=>s+x.fitness,0)/results.length;ga.history.push({best:ga.best.fitness,average:ga.average});if(ga.history.length>120)ga.history.shift();
    $('#gaGeneration').textContent=String(ga.generation);$('#gaFitness').textContent=String(Math.round(ga.best.fitness));$('#gaAverage').textContent=String(Math.round(ga.average));
    gaDraw(results);gaDrawChart();
    if(ga.best.arrived){ga.solved=true;ga.running=false;clearTimeout(ga.timer);if(gaStart)gaStart.textContent='Solved — reset';announce('gaStatus',`A creature reached the exit in generation ${ga.generation}. The population evolved a valid route.`, 'win');arcadeResult('evolution','completed',{generation:ga.generation,solved:true});return;}
    ga.population=gaNextPopulation(results);
    if(ga.generation>=120){ga.running=false;clearTimeout(ga.timer);if(gaStart)gaStart.textContent='Evolve again';announce('gaStatus','120 generations reached. The strongest route is shown; reset or keep evolving for another run.','warn');arcadeResult('evolution','completed',{generation:ga.generation,solved:false});return;}
    if(ga.running){const speed=Number(gaSpeed?.value)||3;ga.timer=window.setTimeout(gaGeneration,Math.max(65,560/speed));}
  }
  gaStart?.addEventListener('click',()=>{if(ga.solved||ga.generation>=120){gaReset();return;}ga.running=!ga.running;if(ga.running){gaStart.textContent='Pause evolution';announce('gaStatus','Evolution running — tournament selection, crossover, and mutation are active.','warn');gaGeneration();}else{clearTimeout(ga.timer);gaStart.textContent='Resume evolution';announce('gaStatus',`Paused at generation ${ga.generation}.`);}});
  $('#gaReset')?.addEventListener('click',gaReset);
  gaPop?.addEventListener('input',gaReset);
  gaMutation?.addEventListener('input',()=>$('#gaMutValue').textContent=`${Math.round(Number(gaMutation.value)*100)}%`);
  gaSpeed?.addEventListener('input',()=>$('#gaSpeedValue').textContent=`${gaSpeed.value}×`);
  gaReset();

  // 4. DYNAMIC LABYRINTH ARCHITECT — Manhattan A* recomputes open/closed sets
  // and refuses any player placement that fully seals the runner's only route.
  const ARCH_C=12,ARCH_R=8,archBoard=$('#archBoard');
  const arch={runner:6*ARCH_C,exit:1*ARCH_C+11,tiles:new Map(),resources:18,turns:0,slowWait:0,tool:'wall',over:false,debug:false};
  const aId=(r,c)=>r*ARCH_C+c;
  const archFixed=new Set();
  for(let r=0;r<ARCH_R;r++)if(r!==2)archFixed.add(aId(r,3));
  for(let r=0;r<ARCH_R;r++)if(r!==6)archFixed.add(aId(r,6));
  for(let r=0;r<ARCH_R;r++)if(r!==2&&r!==3)archFixed.add(aId(r,9));
  function aNeighbors(i){const r=Math.floor(i/ARCH_C),c=i%ARCH_C;return [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].filter(([y,x])=>y>=0&&y<ARCH_R&&x>=0&&x<ARCH_C).map(([y,x])=>aId(y,x));}
  function aSearch(start=arch.runner,tiles=arch.tiles){
    if(start===arch.exit)return {path:[start],open:new Set(),closed:new Set()};
    const open=[start],came=new Map(),g=new Map([[start,0]]),closed=new Set();
    const h=i=>Math.abs(Math.floor(i/ARCH_C)-Math.floor(arch.exit/ARCH_C))+Math.abs(i%ARCH_C-arch.exit%ARCH_C);
    while(open.length){open.sort((x,y)=>(g.get(x)+h(x))-(g.get(y)+h(y)));const cur=open.shift();if(closed.has(cur))continue;closed.add(cur);
      if(cur===arch.exit){const path=[cur];let p=cur;while(came.has(p)){p=came.get(p);path.push(p);}path.reverse();return {path,open:new Set(open),closed};}
      for(const n of aNeighbors(cur)){if(archFixed.has(n)||tiles.get(n)==='wall'||closed.has(n))continue;const cost=tiles.get(n)==='slow'?4:1,ng=g.get(cur)+cost;if(ng<(g.get(n)??Infinity)){came.set(n,cur);g.set(n,ng);if(!open.includes(n))open.push(n);}}
    }
    return {path:null,open:new Set(open),closed};
  }
  function aRender(){
    if(!archBoard)return;archBoard.replaceChildren();const result=aSearch();
    for(let r=0;r<ARCH_R;r++)for(let c=0;c<ARCH_C;c++){
      const i=aId(r,c),b=document.createElement('button'),tile=arch.tiles.get(i);b.type='button';b.className='arch-cell';
      const fixed=archFixed.has(i),runner=i===arch.runner,exit=i===arch.exit,onPath=result.path?.includes(i);
      if(fixed)b.classList.add('fixed-wall');if(tile==='wall')b.classList.add('user-wall');if(tile==='slow')b.classList.add('slow-tile');
      if(arch.debug&&result.closed.has(i))b.classList.add('arch-closed');else if(arch.debug&&result.open.has(i))b.classList.add('arch-open');if(onPath&&!runner&&!exit)b.classList.add('path-tile');if(runner)b.classList.add('runner');if(exit)b.classList.add('exit');
      b.textContent=runner?'R':exit?'E':tile==='wall'?'×':tile==='slow'?'S':'';
      b.setAttribute('aria-label',`${runner?'Runner at ':exit?'Exit at ':''}row ${r+1}, column ${c+1}${fixed?', fixed stone wall':tile==='wall'?', your barrier':tile==='slow'?', slowing moss':onPath?', on A-star path':''}`);
      b.disabled=arch.over||fixed||runner||exit;
      b.addEventListener('click',()=>aPlace(i));archBoard.appendChild(b);
    }
    $('#archResources').textContent=String(arch.resources);$('#archTurns').textContent=String(arch.turns);$('#archPathLength').textContent=result.path?String(result.path.length-1):'—';$('#archOpenCount').textContent=String(result.open.size);$('#archClosedCount').textContent=String(result.closed.size);
  }
  function aPlace(i){
    if(arch.over)return;const price=arch.tool==='wall'?2:arch.tool==='slow'?1:0;
    if(arch.tool==='erase'){arch.tiles.delete(i);announce('archStatus','Tile cleared. The A-star route has been recalculated.');aRender();return;}
    if(arch.resources<price){announce('archStatus','Builder is out of resources. Advance the runner or reset the challenge.','danger');return;}
    const next=new Map(arch.tiles);next.set(i,arch.tool);const path=aSearch(arch.runner,next);
    if(!path.path){announce('archStatus','That placement seals every route. A-star rejected the barrier; choose a different cell.','danger');return;}
    arch.tiles=next;arch.resources-=price;announce('archStatus',`${arch.tool==='wall'?'Barrier':'Slowing moss'} placed. A-star recalculated a ${path.path.length-1}-step route.`);aRender();
  }
  $$('[data-arch-tool]').forEach(b=>b.addEventListener('click',()=>{arch.tool=b.dataset.archTool;$$('[data-arch-tool]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));}));
  $('#archDebug')?.addEventListener('change',e=>{arch.debug=e.target.checked;aRender();});
  $('#archAdvance')?.addEventListener('click',()=>{
    if(arch.over)return;if(arch.slowWait>0){arch.slowWait--;arch.turns++;if(arch.turns>=30){arch.over=true;announce('archStatus','Builder wins — the runner survived 30 turns without reaching the exit.','win');arcadeResult('architect','win',{turns:arch.turns});}else announce('archStatus',`Runner is bogged down. ${30-arch.turns} turns remain; the slow tile cost it a move.`,'warn');aRender();return;}const result=aSearch();if(!result.path||result.path.length<2){announce('archStatus','The runner has no legal route. Reset the maze to continue.','danger');return;}
    arch.runner=result.path[1];arch.slowWait=arch.tiles.get(arch.runner)==='slow'?1:0;arch.turns++;if(arch.runner===arch.exit){arch.over=true;announce('archStatus','Runner escaped — the exit was reached before the canopy held.','danger');arcadeResult('architect','loss',{turns:arch.turns});}else if(arch.turns>=30){arch.over=true;announce('archStatus','Builder wins — the runner survived 30 turns without reaching the exit.','win');arcadeResult('architect','win',{turns:arch.turns});}else announce('archStatus',`Runner advanced one step. ${30-arch.turns} turns remain; its A-star path is live.`,'warn');aRender();
  });
  $('#archReset')?.addEventListener('click',()=>{arch.runner=6*ARCH_C;arch.tiles=new Map();arch.resources=18;arch.turns=0;arch.slowWait=0;arch.over=false;arch.debug=$('#archDebug')?.checked||false;announce('archStatus','Place barriers and slow tiles, then advance the runner.');aRender();});
  aRender();

  // 5. CELLULAR OUTBREAK — seed placement, energy-limited multistate Life, and
  // generation updates calculated from separate next-state buffers.
  const OUT_W=28,OUT_H=18,OUT_TOTAL=OUT_W*OUT_H,OUT_GEN_LIMIT=72;
  const outCanvas=$('#outbreakCanvas'),outCtx=outCanvas?.getContext('2d');
  const outbreak={cells:new Uint8Array(OUT_TOTAL),energy:new Uint8Array(OUT_TOTAL),generation:0,seeds:0,active:false,over:false,running:false,timer:0,cursor:Math.floor(OUT_H/2)*OUT_W+Math.floor(OUT_W/2)};
  function oCounts(){let a=0,b=0;for(const v of outbreak.cells){if(v===1)a++;else if(v===2)b++;}return {a,b};}
  function oDraw(){
    if(!outCtx)return;const cw=outCanvas.width/OUT_W,ch=outCanvas.height/OUT_H;outCtx.fillStyle='#061b24';outCtx.fillRect(0,0,outCanvas.width,outCanvas.height);
    for(let r=0;r<OUT_H;r++)for(let c=0;c<OUT_W;c++){const i=r*OUT_W+c,x=c*cw,y=r*ch,v=outbreak.cells[i],e=outbreak.energy[i];
      outCtx.fillStyle=v===1?'#e87569':v===2?'#41b8bf':`rgba(75,145,111,${.035+e*.018})`;outCtx.fillRect(x+1,y+1,cw-2,ch-2);
      if(v){outCtx.fillStyle=v===1?'rgba(255,205,164,.55)':'rgba(203,249,242,.58)';outCtx.beginPath();outCtx.arc(x+cw*.33,y+ch*.28,Math.max(1.2,cw*.07),0,Math.PI*2);outCtx.fill();}
    }
    outCtx.strokeStyle='rgba(190,225,195,.13)';outCtx.lineWidth=1;outCtx.beginPath();for(let c=0;c<=OUT_W;c++){outCtx.moveTo(c*cw,0);outCtx.lineTo(c*cw,outCanvas.height);}for(let r=0;r<=OUT_H;r++){outCtx.moveTo(0,r*ch);outCtx.lineTo(outCanvas.width,r*ch);}outCtx.stroke();
    if(!outbreak.active){const r=Math.floor(outbreak.cursor/OUT_W),c=outbreak.cursor%OUT_W;outCtx.strokeStyle='#ffcf73';outCtx.lineWidth=2;outCtx.strokeRect(c*cw+2,r*ch+2,cw-4,ch-4);}
    const {a,b}=oCounts(),sum=a+b,pct=sum?Math.round(a*100/sum):50;$('#outbreakA').textContent=String(a);$('#outbreakB').textContent=String(b);$('#outbreakGen').textContent=String(outbreak.generation);$('#outbreakSeedCount').textContent=String(outbreak.seeds);$('#territoryRed').style.flex=`0 0 ${pct}%`;$('#territoryBlue').style.flex=`0 0 ${100-pct}%`;
    $('#outbreakSeedButton').disabled=outbreak.active||outbreak.seeds<3;
    $('#outbreakPlay').disabled=!outbreak.active||outbreak.over||outbreak.generation>=OUT_GEN_LIMIT;
    $('#outbreakStep').disabled=!outbreak.active||outbreak.over||outbreak.generation>=OUT_GEN_LIMIT;
  }
  function oSeed(i){if(outbreak.active||outbreak.cells[i]||outbreak.seeds>=12)return;outbreak.cells[i]=1;outbreak.energy[i]=6;outbreak.seeds++;$('#outbreakCursor').textContent=`Seed at row ${Math.floor(i/OUT_W)+1}, column ${i%OUT_W+1}`;oDraw();}
  function oStart(){
    if(outbreak.active||outbreak.over||outbreak.seeds<3){announce('outbreakStatus','Place at least 3 player spores before the evolution can start.','warn');return;}
    let placed=0,attempt=0;while(placed<12&&attempt<300){const c=18+Math.floor(Math.random()*10),r=Math.floor(Math.random()*OUT_H),i=r*OUT_W+c;attempt++;if(outbreak.cells[i])continue;outbreak.cells[i]=2;outbreak.energy[i]=6;placed++;}
    outbreak.active=true;$('#outbreakSeedButton').textContent='Seed phase closed';announce('outbreakStatus','Both factions are seeded. Step a generation or start the live simulation.','warn');oDraw();
  }
  function oStep(){
    if(!outbreak.active||outbreak.generation>=OUT_GEN_LIMIT)return;
    const next=new Uint8Array(OUT_TOTAL),nextEnergy=new Uint8Array(OUT_TOTAL);
    for(let r=0;r<OUT_H;r++)for(let c=0;c<OUT_W;c++){
      const i=r*OUT_W+c,cur=outbreak.cells[i],energy=outbreak.energy[i];let one=0,two=0;
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const y=r+dr,x=c+dc;if(y<0||y>=OUT_H||x<0||x>=OUT_W)continue;const v=outbreak.cells[y*OUT_W+x];if(v===1)one++;else if(v===2)two++;}
      const total=one+two,resource=cur?energy:Math.min(6,energy+1);
      if(cur){
        if((total===2||total===3)&&resource>1){const own=cur===1?one:two,opp=cur===1?two:one;if(opp>=own+2&&resource>=4){next[i]=3-cur;nextEnergy[i]=resource-2;}else{next[i]=cur;nextEnergy[i]=Math.min(6,resource-1+Math.max(0,own-2));}}
        else nextEnergy[i]=Math.max(0,resource-2);
      }else if(total===3&&resource>=2){next[i]=one===two?(((r+c+outbreak.generation)%2)?1:2):one>two?1:2;nextEnergy[i]=resource-2;}
      else nextEnergy[i]=resource;
    }
    outbreak.cells=next;outbreak.energy=nextEnergy;outbreak.generation++;
    const {a,b}=oCounts();oDraw();
    if(outbreak.generation>=OUT_GEN_LIMIT||((a===0||b===0)&&outbreak.generation>=10)){
      outbreak.running=false;outbreak.active=false;outbreak.over=true;clearTimeout(outbreak.timer);const winner=a===b?'No faction holds the canopy — the outbreak ends in a draw.':a>b?'Orchid wins the canopy.':'Tide wins the canopy.';announce('outbreakStatus',`${winner} Final territory: Orchid ${a}, Tide ${b}, after ${outbreak.generation} generations.`,a===b?'warn':a>b?'win':'danger');$('#outbreakPlay').textContent='Simulation complete';$('#outbreakStep').disabled=true;$('#outbreakSeedButton').disabled=true;arcadeResult('outbreak',a===b?'draw':a>b?'win':'loss',{orchid:a,tide:b,generation:outbreak.generation});oDraw();
    }
  }
  function oLoop(){if(!outbreak.running)return;oStep();if(outbreak.running)outbreak.timer=window.setTimeout(oLoop,reducedMotion?300:150);}
  function oReset(){clearTimeout(outbreak.timer);outbreak.cells=new Uint8Array(OUT_TOTAL);outbreak.energy=new Uint8Array(OUT_TOTAL);for(let i=0;i<OUT_TOTAL;i++)outbreak.energy[i]=2+(i*7+Math.floor(i/OUT_W)*13)%4;outbreak.generation=0;outbreak.seeds=0;outbreak.active=false;outbreak.over=false;outbreak.running=false;outbreak.cursor=Math.floor(OUT_H/2)*OUT_W+Math.floor(OUT_W/2);$('#outbreakSeedButton').textContent='Start evolution';$('#outbreakPlay').textContent='Run';announce('outbreakStatus','Place 3–12 orchid spores on the grid. Tide seeds itself after you start.');oDraw();}
  outCanvas?.addEventListener('pointerdown',e=>{if(outbreak.active)return;const rect=outCanvas.getBoundingClientRect(),c=clamp(Math.floor((e.clientX-rect.left)/rect.width*OUT_W),0,OUT_W-1),r=clamp(Math.floor((e.clientY-rect.top)/rect.height*OUT_H),0,OUT_H-1);outbreak.cursor=r*OUT_W+c;oSeed(outbreak.cursor);});
  outCanvas?.addEventListener('keydown',e=>{if(outbreak.active)return;let r=Math.floor(outbreak.cursor/OUT_W),c=outbreak.cursor%OUT_W;if(e.key==='ArrowUp')r=clamp(r-1,0,OUT_H-1);else if(e.key==='ArrowDown')r=clamp(r+1,0,OUT_H-1);else if(e.key==='ArrowLeft')c=clamp(c-1,0,OUT_W-1);else if(e.key==='ArrowRight')c=clamp(c+1,0,OUT_W-1);else if(e.key==='Enter'||e.key===' '){e.preventDefault();oSeed(outbreak.cursor);return;}else return;e.preventDefault();outbreak.cursor=r*OUT_W+c;$('#outbreakCursor').textContent=`Cursor: row ${r+1}, column ${c+1}`;oDraw();});
  $('#outbreakSeedButton')?.addEventListener('click',oStart);
  $('#outbreakStep')?.addEventListener('click',()=>{if(!outbreak.active)oStart();oStep();});
  $('#outbreakPlay')?.addEventListener('click',()=>{if(!outbreak.active)oStart();if(outbreak.generation>=OUT_GEN_LIMIT)return;outbreak.running=!outbreak.running;$('#outbreakPlay').textContent=outbreak.running?'Pause':'Run';if(outbreak.running)oLoop();else clearTimeout(outbreak.timer);});
  $('#outbreakReset')?.addEventListener('click',oReset);
  oReset();

  // 6. SPORE CIPHER — 5 pegs, 7 colors, duplicate symbols allowed. Its hint
  // samples the surviving code space and chooses a minimax, low-worst-case guess.
  const CIPHER_COLORS=[
    {name:'Lime',hex:'#baf273'},{name:'Coral',hex:'#ff9b7f'},{name:'Sky',hex:'#86c9ff'},
    {name:'Gold',hex:'#ffcf73'},{name:'Violet',hex:'#bda0ff'},{name:'Tide',hex:'#43c7bd'},{name:'Moon',hex:'#e7eef0'}
  ];
  const CIPHER_LEN=5,CIPHER_COUNT=CIPHER_COLORS.length,CIPHER_MAX=10;
  const allCodes=[];
  function buildCodes(prefix=[]){if(prefix.length===CIPHER_LEN){allCodes.push(prefix.slice());return;}for(let c=0;c<CIPHER_COUNT;c++)buildCodes([...prefix,c]);}
  buildCodes();
  const cipher={secret:[],history:[],over:false};
  function cRandomSecret(){cipher.secret=Array.from({length:CIPHER_LEN},()=>Math.floor(Math.random()*CIPHER_COUNT));}
  function cFeedback(guess,secret){let exact=0,g=[0,0,0,0,0,0,0],s=[0,0,0,0,0,0,0];for(let i=0;i<CIPHER_LEN;i++){if(guess[i]===secret[i])exact++;else{g[guess[i]]++;s[secret[i]]++;}}let color=0;for(let i=0;i<CIPHER_COUNT;i++)color+=Math.min(g[i],s[i]);return {exact,color};}
  function cConsistent(code){return cipher.history.every(h=>{const f=cFeedback(h.guess,code);return f.exact===h.feedback.exact&&f.color===h.feedback.color;});}
  function cCandidates(){return allCodes.filter(cConsistent);}
  function cCreateDot(colorIndex,label=''){const dot=document.createElement('span');dot.className='cipher-peg';dot.style.background=CIPHER_COLORS[colorIndex].hex;dot.setAttribute('aria-label',label||CIPHER_COLORS[colorIndex].name);dot.setAttribute('role','img');return dot;}
  function cRender(){
    const history=$('#cipherHistory');if(!history)return;history.replaceChildren();
    cipher.history.forEach((h,index)=>{const li=document.createElement('li'),row=document.createElement('span');row.className='cipher-row';row.setAttribute('aria-label',`Guess ${index+1}`);h.guess.forEach((v,i)=>row.appendChild(cCreateDot(v,`Peg ${i+1}: ${CIPHER_COLORS[v].name}`)));const fb=document.createElement('span');fb.className='cipher-feedback';fb.textContent=`${h.feedback.exact} exact · ${h.feedback.color} right color`;li.append(row,fb);history.appendChild(li);});
    $('#cipherAttempts').textContent=`${cipher.history.length}/${CIPHER_MAX}`;$('#cipherPossibilities').textContent=String(cipher.over?0:cCandidates().length);
    $('#cipherGuess').disabled=cipher.over;$('#cipherHint').disabled=cipher.over;$('#cipherSecret').replaceChildren();
    if(cipher.over){cipher.secret.forEach((v,i)=>$('#cipherSecret').appendChild(cCreateDot(v,`Secret peg ${i+1}: ${CIPHER_COLORS[v].name}`)));}
    $$('[data-cipher-peg]').forEach((select,index)=>{select.disabled=cipher.over;select.style.borderLeft=`6px solid ${CIPHER_COLORS[Number(select.value)].hex}`;select.setAttribute('aria-label',`Guess peg ${index+1}, ${CIPHER_COLORS[Number(select.value)].name}`);});
  }
  function cHint(){
    const candidates=cCandidates();if(!candidates.length){announce('cipherStatus','No code remains consistent — reset the round to try again.','danger');return;}
    const step=Math.max(1,Math.ceil(candidates.length/260)),secrets=candidates.filter((_,i)=>i%step===0).slice(0,260),guesses=candidates.length<=260?candidates:candidates.filter((_,i)=>i%step===0).slice(0,260);
    let best=guesses[0],bestWorst=Infinity;
    for(const guess of guesses){const buckets=new Map();let worst=0;for(const secret of secrets){const f=cFeedback(guess,secret),key=`${f.exact}:${f.color}`,n=(buckets.get(key)||0)+1;buckets.set(key,n);if(n>worst)worst=n;}if(worst<bestWorst){bestWorst=worst;best=guess;}}
    $$('[data-cipher-peg]').forEach((select,i)=>{select.value=String(best[i]);select.style.borderLeft=`6px solid ${CIPHER_COLORS[best[i]].hex}`;});announce('cipherStatus',`Minimax hint loaded: ${best.map(v=>CIPHER_COLORS[v].name).join(', ')}. It minimizes the largest sampled answer bucket.`,'warn');
  }
  function cReset(){cipher.history=[];cipher.over=false;cRandomSecret();$$('[data-cipher-peg]').forEach((s,i)=>{s.value=String((i*2)%CIPHER_COUNT);});announce('cipherStatus','A secret 5-spore code is set. Duplicates are allowed; feedback never reveals positions for color-only matches.');cRender();}
  $('#cipherGuess')?.addEventListener('click',()=>{
    if(cipher.over)return;const guess=$$('[data-cipher-peg]').map(s=>Number(s.value)),feedback=cFeedback(guess,cipher.secret);cipher.history.push({guess,feedback});
    if(feedback.exact===CIPHER_LEN){cipher.over=true;announce('cipherStatus',`Code cracked in ${cipher.history.length} guesses. The canopy yields.`, 'win');arcadeResult('cipher','win',{guesses:cipher.history.length});}
    else if(cipher.history.length>=CIPHER_MAX){cipher.over=true;announce('cipherStatus',`The spores escaped. Secret code: ${cipher.secret.map(v=>CIPHER_COLORS[v].name).join(', ')}.`, 'danger');arcadeResult('cipher','loss',{guesses:cipher.history.length});}
    else announce('cipherStatus',`${feedback.exact} exact and ${feedback.color} correct color in another slot. ${cCandidates().length} possible codes remain.`, 'warn');
    cRender();
  });
  $('#cipherHint')?.addEventListener('click',cHint);
  $('#cipherReset')?.addEventListener('click',cReset);
  cReset();

  // Explicit, versioned, JSON-safe save/restore surface. Validators build a full
  // candidate state before touching live state, so malformed user saves are inert.
  const plain = v => JSON.parse(JSON.stringify(v));
  const validArray=(v,n,test)=>Array.isArray(v)&&v.length===n&&v.every(test);
  const intRange=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
  function reg(name,api){(window.ArcadeGames ||= {})[name]=api;}
  reg('hex',{snapshot(){if(hex.busy)throw Error('Hex AI is busy; save after its move.');return {version:1,board:hex.board.slice(),player:hex.player,ai:hex.ai,over:hex.over,history:plain(hex.history),redo:plain(hex.redo),depth:Number($('#hexDepth')?.value)||2};},restore(s){if(!s||s.version!==1||!validArray(s.board,HEX_N*HEX_N,v=>intRange(v,0,2))||![1,2].includes(s.player)||typeof s.ai!=='boolean'||typeof s.over!=='boolean'||!Array.isArray(s.history)||!Array.isArray(s.redo)||!intRange(s.depth,1,5)||((hWinner(s.board)!==0)!==s.over))throw Error('Invalid Hex save.');const validSnap=x=>x&&validArray(x.board,HEX_N*HEX_N,v=>intRange(v,0,2))&&[1,2].includes(x.player)&&typeof x.over==='boolean';if(!s.history.every(validSnap)||!s.redo.every(x=>x&&validSnap(x)&&Array.isArray(x.snapshots)&&x.snapshots.every(validSnap)))throw Error('Invalid Hex history.');clearTimeout(hex.timer);Object.assign(hex,{board:s.board.slice(),player:s.player,ai:s.ai,over:s.over,busy:false,history:plain(s.history),redo:plain(s.redo)});if($('#hexDepth'))$('#hexDepth').value=String(s.depth);$$('[data-hex-mode]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.hexMode==='ai')===hex.ai)));hRender();announce('hexStatus','Game restored paused.');}});
  reg('network',{snapshot(){return {version:1,blocked:[...net.blocked],route:plain(net.route),col:net.col,row:net.row,turns:net.turns,selected:net.selected,over:net.over,critical:net.critical,criticalGoal:net.criticalGoal,log:net.log.slice()};},restore(s){if(!s||s.version!==1||!Array.isArray(s.blocked)||!s.blocked.every(x=>intRange(x,0,NET_COLS*NET_ROWS-1))||new Set(s.blocked).size!==s.blocked.length||!intRange(s.col,0,NET_COLS-1)||!intRange(s.row,0,NET_ROWS-1)||!intRange(s.turns,0,NET_COLS)||!intRange(s.selected,-1,NET_COLS*NET_ROWS-1)||typeof s.over!=='boolean'||!intRange(s.critical,0,4)||s.criticalGoal!==4||!Array.isArray(s.log)||!s.log.every(x=>typeof x==='string')||(!s.over&&(!s.route||!Array.isArray(s.route.cols)||!Array.isArray(s.route.rows)||s.route.cols.length!==s.route.rows.length||!s.route.cols.every(x=>intRange(x,0,NET_COLS-1))||!s.route.rows.every(x=>intRange(x,0,NET_ROWS-1)))))throw Error('Invalid network save.');const blocked=new Set(s.blocked),expected=cspRoute(blocked,s.col,s.row);if(!s.over&&(!expected||JSON.stringify(expected)!==JSON.stringify(s.route)))throw Error('Invalid network route.');Object.assign(net,{blocked,route:s.over?null:plain(s.route),col:s.col,row:s.row,turns:s.turns,selected:s.selected,over:s.over,critical:s.critical,criticalGoal:4,log:s.log.slice(0,5)});nRender();announce('networkStatus','Game restored paused.');}});
  reg('evolution',{snapshot(){return {version:1,gaWalls:plain(gaWalls),population:plain(ga.population),generation:ga.generation,history:plain(ga.history),best:ga.best?plain(ga.best):null,average:ga.average,solved:ga.solved,settings:{population:Number(gaPop?.value)||48,mutation:Number(gaMutation?.value)||.12,speed:Number(gaSpeed?.value)||3}};},restore(s){const num=x=>Number.isFinite(x);if(!s||s.version!==1||!Array.isArray(s.gaWalls)||s.gaWalls.length!==10||!s.gaWalls.every(w=>w&&num(w.x)&&num(w.y)&&num(w.w)&&num(w.h)&&w.x>=0&&w.x<=GA_W&&w.y>=0&&w.y<=GA_H&&w.w>0&&w.h>0)||!Array.isArray(s.population)||!s.population.length||s.population.length>200||!s.population.every(g=>validArray(g,GA_GENES,num))||!intRange(s.generation,0,120)||!Array.isArray(s.history)||s.history.length>120||!s.history.every(p=>p&&num(p.best)&&num(p.average))||!num(s.average)||typeof s.solved!=='boolean'||(s.best&&(!Array.isArray(s.best.trace)||!s.best.trace.every(p=>validArray(p,2,num))||!validArray(s.best.genome,GA_GENES,num)||!num(s.best.fitness)))||!s.settings||!intRange(s.settings.population,1,200)||!num(s.settings.mutation)||s.settings.mutation<0||s.settings.mutation>1||!num(s.settings.speed)||s.settings.speed<1||s.settings.speed>10)throw Error('Invalid evolution save.');clearTimeout(ga.timer);gaWalls=plain(s.gaWalls);Object.assign(ga,{population:plain(s.population),generation:s.generation,history:plain(s.history),best:s.best?plain(s.best):null,average:s.average,solved:s.solved,running:false});if(gaPop)gaPop.value=String(s.settings.population);if(gaMutation)gaMutation.value=String(s.settings.mutation);if(gaSpeed)gaSpeed.value=String(s.settings.speed);$('#gaGeneration').textContent=String(ga.generation);$('#gaFitness').textContent=ga.best?String(Math.round(ga.best.fitness)):'—';$('#gaAverage').textContent=ga.generation?String(Math.round(ga.average)):'—';$('#gaMutValue').textContent=`${Math.round(s.settings.mutation*100)}%`;$('#gaPopulationValue').textContent=String(s.settings.population);$('#gaSpeedValue').textContent=`${s.settings.speed}×`;if(gaStart)gaStart.textContent='Resume evolution';gaDraw();gaDrawChart();announce('gaStatus','Evolution restored paused.');}});
  reg('architect',{snapshot(){return {version:1,runner:arch.runner,exit:arch.exit,tiles:[...arch.tiles],resources:arch.resources,turns:arch.turns,slowWait:arch.slowWait,tool:arch.tool,over:arch.over,debug:arch.debug};},restore(s){if(!s||s.version!==1||!intRange(s.runner,0,ARCH_C*ARCH_R-1)||s.exit!==arch.exit||!Array.isArray(s.tiles)||!s.tiles.every(x=>Array.isArray(x)&&intRange(x[0],0,ARCH_C*ARCH_R-1)&&['wall','slow'].includes(x[1]))||new Set(s.tiles.map(x=>x[0])).size!==s.tiles.length||!intRange(s.resources,0,18)||!intRange(s.turns,0,30)||!intRange(s.slowWait,0,1)||!['wall','slow','erase'].includes(s.tool)||typeof s.over!=='boolean'||typeof s.debug!=='boolean')throw Error('Invalid architect save.');const tiles=new Map(s.tiles);if(archFixed.has(s.runner)||tiles.get(s.runner)==='wall'||!aSearch(s.runner,tiles).path||s.slowWait&&tiles.get(s.runner)!=='slow')throw Error('Invalid architect board.');Object.assign(arch,{runner:s.runner,tiles,resources:s.resources,turns:s.turns,slowWait:s.slowWait,tool:s.tool,over:s.over,debug:s.debug});if($('#archDebug'))$('#archDebug').checked=s.debug;$$('[data-arch-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.archTool===arch.tool)));aRender();announce('archStatus','Maze restored paused.');}});
  reg('outbreak',{snapshot(){return {version:1,cells:Array.from(outbreak.cells),energy:Array.from(outbreak.energy),generation:outbreak.generation,seeds:outbreak.seeds,active:outbreak.active,over:outbreak.over,cursor:outbreak.cursor};},restore(s){if(!s||s.version!==1||!validArray(s.cells,OUT_TOTAL,x=>intRange(x,0,3))||!validArray(s.energy,OUT_TOTAL,x=>intRange(x,0,6))||!intRange(s.generation,0,OUT_GEN_LIMIT)||!intRange(s.seeds,0,12)||typeof s.active!=='boolean'||typeof s.over!=='boolean'||(s.over&&s.active)||!intRange(s.cursor,0,OUT_TOTAL-1)||(!s.active&&!s.over&&s.generation>0))throw Error('Invalid outbreak save.');clearTimeout(outbreak.timer);Object.assign(outbreak,{cells:Uint8Array.from(s.cells),energy:Uint8Array.from(s.energy),generation:s.generation,seeds:s.seeds,active:s.active,over:s.over,running:false,cursor:s.cursor});$('#outbreakSeedButton').textContent=s.active?'Seed phase closed':'Start evolution';$('#outbreakPlay').textContent=s.over?'Simulation complete':'Run';$('#outbreakStep').disabled=!s.active||s.over;$('#outbreakSeedButton').disabled=s.active||s.over||s.seeds<3;oDraw();announce('outbreakStatus','Outbreak restored paused.');}});
  reg('cipher',{snapshot(){return {version:1,secret:cipher.secret.slice(),history:plain(cipher.history),over:cipher.over,pegs:$$('[data-cipher-peg]').map(x=>Number(x.value))};},restore(s){if(!s||s.version!==1||!validArray(s.secret,CIPHER_LEN,x=>intRange(x,0,CIPHER_COUNT-1))||!Array.isArray(s.history)||s.history.length>CIPHER_MAX||!s.history.every(h=>h&&validArray(h.guess,CIPHER_LEN,x=>intRange(x,0,CIPHER_COUNT-1))&&h.feedback&&intRange(h.feedback.exact,0,CIPHER_LEN)&&intRange(h.feedback.color,0,CIPHER_LEN)&&h.feedback.exact+h.feedback.color<=CIPHER_LEN)||typeof s.over!=='boolean'||!validArray(s.pegs,CIPHER_LEN,x=>intRange(x,0,CIPHER_COUNT-1)))throw Error('Invalid cipher save.');const hist=plain(s.history);if(hist.some(h=>{const f=cFeedback(h.guess,s.secret);return f.exact!==h.feedback.exact||f.color!==h.feedback.color;})||(!s.over&&hist.some(h=>h.feedback.exact===CIPHER_LEN))||(s.over&&hist.length===0))throw Error('Invalid cipher history.');Object.assign(cipher,{secret:s.secret.slice(),history:hist,over:s.over});$$('[data-cipher-peg]').forEach((p,i)=>p.value=String(s.pegs[i]));cRender();announce('cipherStatus','Cipher restored paused.');}});
})();

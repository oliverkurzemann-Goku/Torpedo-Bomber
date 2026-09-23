/* Two independent campaigns; only completed combat sorties advance progress.
   Existing logbooks and mission selection remain available for replay. */
(function(global){
  const KEY='squadron_campaign_v1';
  function read(){try{return JSON.parse(localStorage.getItem(KEY))||{};}catch(_){return {};}}
  function record(chapter,index){
    if(!['pacific','europe','remagen','europeRhine'].includes(chapter)||!Number.isInteger(index)||index<0)return;
    const data=read();data[chapter]=Math.max(Number(data[chapter])||0,index);
    try{localStorage.setItem(KEY,JSON.stringify(data));}catch(_){}
  }
  function highest(chapter){return Math.max(0,Number(read()[chapter])||0);}
  global.SquadronCampaign={record,highest};
})(window);

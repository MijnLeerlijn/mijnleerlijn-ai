import type { Payload } from "payload";
import { haalScholenPagina, mondayQuery, type MondaySchoolItem } from "./monday-client";
import { SCHOLEN_BOARD_ID, SCHOLEN_KOLOM } from "./monday-columns";
const VERKOOPREGELS_BOARD_ID = "18420120443";
const VK = { school: "board_relation_mm4v2t8y", product: "board_relation_mm4vpq2h", aantal: "numeric_mm5se9vp", verkoopprijs: "numeric_mm5sf441", verkoopdatum: "date_mm5rnabm", status: "color_mm5rkmrn" } as const;
const OMZETSTATUSSEN = new Set(["Gereed", "In uitvoering", "Afgerond"]);
const OPEN = new Set(["Lead", "Prospect", "Wacht op handtekening"]);
export interface DashboardReeksPunt { label: string; waarde: number }
export interface DashboardSchool { naam: string; licenties: number; relatiestatus: string; onderwijstype: string[]; bron: string | null; whitelabel: string | null; klantGeworden: string | null }
export interface SalesDashboardData {
  gegenereerdOp: string;
  kpis: { omzetTotaal: number; omzetDitJaar: number; klanten: number; leerlingenBijKlanten: number; openPipeline: number; pipelineLicenties: number; schoolEquivalent: number; pipelineSchoolEquivalent: number; gemiddeldeOmzetPerKlant: number };
  omzetPerProduct: DashboardReeksPunt[]; omzetPerMaand: DashboardReeksPunt[]; funnel: DashboardReeksPunt[]; klantenGeworden: DashboardReeksPunt[]; klantenPerOnderwijstype: DashboardReeksPunt[]; klantenPerBron: DashboardReeksPunt[]; licentiesPerBron: DashboardReeksPunt[]; klanten: DashboardSchool[];
  historie: { transities: number; volledigeTransities: number; eersteWaardeZonderVorige: number };
}
function k(item: MondaySchoolItem,id:string){return item.column_values.find(c=>c.id===id)}
function tekst(item:MondaySchoolItem,id:string){const v=k(item,id)?.text;return v&&v.trim()?v.trim():null}
function nummer(item:MondaySchoolItem,id:string){const raw=tekst(item,id);if(!raw)return 0;const n=Number(raw.replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0}
function relaties(item:MondaySchoolItem,id:string){return(k(item,id)?.linked_item_ids??[]).map(String)}
async function alle(boardId:string,columnIds:string[]){const out:MondaySchoolItem[]=[];let cursor:string|null=null;do{const p=await haalScholenPagina({boardId,columnIds,limit:100,cursor});out.push(...p.items);cursor=p.cursor}while(cursor);return out}
async function namen(ids:string[]){const result=new Map<string,string>();const uniek=[...new Set(ids)].filter(Boolean);for(let i=0;i<uniek.length;i+=100){const data=await mondayQuery<{items:{id:string;name:string}[]}>(`query($ids:[ID!]){items(ids:$ids){id name}}`,{ids:uniek.slice(i,i+100)});for(const x of data.items??[])result.set(String(x.id),x.name)}return result}
function plus(m:Map<string,number>,label:string,v:number){m.set(label,(m.get(label)??0)+v)}
function reeks(m:Map<string,number>,waarde=true){return[...m].map(([label,v])=>({label,waarde:v})).sort(waarde?(a,b)=>b.waarde-a.waarde:(a,b)=>a.label.localeCompare(b.label,"nl"))}
export async function bouwSalesDashboardData(payload:Payload):Promise<SalesDashboardData>{
  const [scholen,verkoopregels,instellingen]=await Promise.all([
    alle(SCHOLEN_BOARD_ID,[SCHOLEN_KOLOM.relatiestatus,SCHOLEN_KOLOM.salesfase,SCHOLEN_KOLOM.aantalLeerlingen,SCHOLEN_KOLOM.typeSchool,SCHOLEN_KOLOM.klantGeworden,SCHOLEN_KOLOM.whitelabel,SCHOLEN_KOLOM.binnengekomenVia]),
    alle(VERKOOPREGELS_BOARD_ID,Object.values(VK)),
    payload.findGlobal({slug:"sales-instellingen",overrideAccess:true,depth:0}) as Promise<unknown>,
  ]);
  const factor=Math.max(1,Number((instellingen as {licentiesPerSchoolEquivalent?:number|null}).licentiesPerSchoolEquivalent??200));
  const productNamen=await namen(verkoopregels.flatMap(r=>relaties(r,VK.product)));const jaar=new Date().getFullYear();let omzetTotaal=0,omzetDitJaar=0;const omzetProduct=new Map<string,number>(),omzetMaand=new Map<string,number>();
  for(const r of verkoopregels){const st=tekst(r,VK.status);if(!st||!OMZETSTATUSSEN.has(st))continue;const totaal=nummer(r,VK.aantal)*nummer(r,VK.verkoopprijs);if(!totaal)continue;omzetTotaal+=totaal;const dRaw=tekst(r,VK.verkoopdatum);if(dRaw){const d=new Date(dRaw);if(!Number.isNaN(d.getTime())){if(d.getFullYear()===jaar)omzetDitJaar+=totaal;plus(omzetMaand,`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`,totaal)}}const ids=relaties(r,VK.product);plus(omzetProduct,ids.length?ids.map(id=>productNamen.get(id)??`Product #${id}`).join(" + "):"Onbekend product",totaal)}
  const funnel=new Map<string,number>(),geworden=new Map<string,number>(),typesMap=new Map<string,number>(),bronKlanten=new Map<string,number>(),bronLicenties=new Map<string,number>();let klantenAantal=0,klantLicenties=0,openPipeline=0,pipelineLicenties=0;const klantRijen:DashboardSchool[]=[];
  for(const school of scholen){const relatie=tekst(school,SCHOLEN_KOLOM.relatiestatus)??"Onbekend",licenties=nummer(school,SCHOLEN_KOLOM.aantalLeerlingen),bron=tekst(school,SCHOLEN_KOLOM.binnengekomenVia),types=(tekst(school,SCHOLEN_KOLOM.typeSchool)?.split(",").map(v=>v.trim()).filter(Boolean)??[]);plus(funnel,relatie,1);if(OPEN.has(relatie)){openPipeline++;pipelineLicenties+=licenties}if(relatie!=="Klant")continue;klantenAantal++;klantLicenties+=licenties;const kg=tekst(school,SCHOLEN_KOLOM.klantGeworden);if(kg)plus(geworden,kg,1);if(types.length===0)plus(typesMap,"Onbekend",1);for(const t of types)plus(typesMap,t,1);plus(bronKlanten,bron??"Onbekend",1);plus(bronLicenties,bron??"Onbekend",licenties);klantRijen.push({naam:school.name,licenties,relatiestatus:relatie,onderwijstype:types,bron,whitelabel:tekst(school,SCHOLEN_KOLOM.whitelabel),klantGeworden:kg})}
  klantRijen.sort((a,b)=>b.licenties-a.licenties||a.naam.localeCompare(b.naam,"nl"));
  const hist=await payload.find({collection:"sales-log-events",where:{type:{equals:"monday_status"}},limit:5000,depth:0,overrideAccess:true});let volledig=0,zonderVorige=0;for(const d of hist.docs){const q=(d as unknown as {payload?:{bronkwaliteit?:string}|null}).payload;if(q?.bronkwaliteit==="volledig")volledig++;else if(q?.bronkwaliteit==="alleen_nieuwe_waarde")zonderVorige++}
  return{gegenereerdOp:new Date().toISOString(),kpis:{omzetTotaal,omzetDitJaar,klanten:klantenAantal,leerlingenBijKlanten:klantLicenties,openPipeline,pipelineLicenties,schoolEquivalent:klantLicenties/factor,pipelineSchoolEquivalent:pipelineLicenties/factor,gemiddeldeOmzetPerKlant:klantenAantal?omzetTotaal/klantenAantal:0},omzetPerProduct:reeks(omzetProduct),omzetPerMaand:reeks(omzetMaand,false),funnel:reeks(funnel),klantenGeworden:reeks(geworden,false),klantenPerOnderwijstype:reeks(typesMap),klantenPerBron:reeks(bronKlanten),licentiesPerBron:reeks(bronLicenties),klanten:klantRijen,historie:{transities:hist.totalDocs,volledigeTransities:volledig,eersteWaardeZonderVorige:zonderVorige}};
}

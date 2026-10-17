'use client';
import {createContext,useContext,useEffect,useState,ReactNode} from 'react';
export type FavoriteKind='league'|'team'|'match';
export type Favorite={kind:FavoriteKind,id:string,label:string,league?:string};
const KEY='cardroom:favorites:v1';
export function parseFavorites(raw:string|null):Favorite[]{try{const value=JSON.parse(raw||'[]');return Array.isArray(value)?value.filter((x:any)=>x&&['league','team','match'].includes(x.kind)&&typeof x.id==='string'&&x.id.length<100&&typeof x.label==='string'&&x.label.length<200&&(!x.league||typeof x.league==='string')).slice(0,200):[]}catch{return []}}
const FavoritesContext=createContext({items:[] as Favorite[],ready:false,storageError:false,has:(_kind:FavoriteKind,_id:string):boolean=>false,toggle:(_kind:FavoriteKind,_id:string,_label:string,_league?:string)=>{}});
export function FavoritesProvider({children}:{children:ReactNode}){
 const [items,setItems]=useState<Favorite[]>([]),[ready,setReady]=useState(false),[storageError,setStorageError]=useState(false);
 useEffect(()=>{try{setItems(parseFavorites(localStorage.getItem(KEY)))}catch{setStorageError(true)}setReady(true);const sync=(e:StorageEvent)=>{if(e.key===KEY)setItems(parseFavorites(e.newValue))};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync)},[]);
 const has=(kind:FavoriteKind,id:string)=>items.some(x=>x.kind===kind&&x.id===id);
 useEffect(()=>{if(ready)try{localStorage.setItem(KEY,JSON.stringify(items));setStorageError(false)}catch{setStorageError(true)}},[items,ready]);
 const toggle=(kind:FavoriteKind,id:string,label:string,league?:string)=>setItems(old=>old.some(x=>x.kind===kind&&x.id===id)?old.filter(x=>x.kind!==kind||x.id!==id):[...old,{kind,id,label,league}].slice(-200));
 return <FavoritesContext.Provider value={{items,ready,storageError,has,toggle}}>{children}</FavoritesContext.Provider>;
}
export const useFavorites=()=>useContext(FavoritesContext);
export function FavoriteButton({kind,id,label,league}:{kind:FavoriteKind,id:string,label:string,league?:string}){const f=useFavorites(),active=f.has(kind,id);return <button type="button" className="favoriteButton" disabled={!f.ready} aria-pressed={active} aria-label={(active?'Убрать из избранного: ':'В избранное: ')+label} onClick={()=>f.toggle(kind,id,label,league)}><FavoriteStar active={active}/></button>}

export function FavoriteStar({active=false}:{active?:boolean}){return <svg className={"favoriteStar"+(active?" isActive":"")} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 2.5 2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55-4.76-4.64 6.58-.96Z"/></svg>}

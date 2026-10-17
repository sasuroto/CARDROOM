import type { Metadata } from 'next';
import './globals.css';
import {FavoritesProvider} from './favorites';
export const metadata:Metadata={title:'CARDROOM — Европейский футбол в цифрах',icons:{icon:'/favicon.svg'},description:'Жёлтые карточки, судьи, голы, фолы и угловые. Девять европейских турниров, источники и проверка качества данных.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ru"><body><FavoritesProvider>{children}</FavoritesProvider></body></html>}

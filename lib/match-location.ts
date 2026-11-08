const normalizePlace=(value:unknown)=>typeof value==='string'?value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ø/g,'o').replace(/[^a-z0-9]/g,''):'';
const ASPMYRA_CITY_SOURCE='https://www.glimt.no/om-stadion/adkomst';
// ESPN venue 1510 currently reports the club name as its city. Correct only the
// verified stadium/country/raw-city combination, never infer from the home team.
// UEFA confirms the same location: https://www.uefa.com/uefachampionsleague/match/2049629--bodo-glimt-vs-lask/matchinfo/
export function normalizeMatchLocation<T extends {venue?:unknown;city?:unknown;country?:unknown}>(match:T):T & {venueCityOriginal?:string;venueCitySource?:string}{
 const stadium=normalizePlace(match.venue)==='aspmyrastadion'&&normalizePlace(match.country)==='norway',city=normalizePlace(match.city);
 if(stadium&&city==='bodoglimt')return {...match,city:'Bodø',venueCityOriginal:String(match.city),venueCitySource:ASPMYRA_CITY_SOURCE};
 const prior=match as T & {venueCityOriginal?:unknown;venueCitySource?:unknown};
 if(('venueCityOriginal' in prior||'venueCitySource' in prior)&&!(stadium&&city==='bodo'&&normalizePlace(prior.venueCityOriginal)==='bodoglimt'&&prior.venueCitySource===ASPMYRA_CITY_SOURCE))return {...match,venueCityOriginal:undefined,venueCitySource:undefined};
 return match;
}

// Match-specific venue data only: never infer a stadium from the home team.
export function venueFields(venue:any) {
 const latitude=venue?.latitude,longitude=venue?.longitude;
 return normalizeMatchLocation({venue:venue?.fullName||venue?.name||null,city:venue?.address?.city||null,country:venue?.address?.country||null,...(typeof latitude==='number'&&typeof longitude==='number'&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180?{venueLatitude:latitude,venueLongitude:longitude}:{})});
}
export function matchLocation(match:any) {
 const location=normalizeMatchLocation(match||{}),place=[location.venue,location.city,location.country].filter(Boolean);
 return place.length?[...new Set(place)].join(' · '):'Место проведения пока не указано';
}

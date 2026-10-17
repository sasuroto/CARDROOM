// Match-specific venue data only: never infer a stadium from the home team.
export function venueFields(venue:any) {
 const latitude=venue?.latitude,longitude=venue?.longitude;
 return {venue:venue?.fullName||venue?.name||null,city:venue?.address?.city||null,country:venue?.address?.country||null,...(typeof latitude==='number'&&typeof longitude==='number'&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180?{venueLatitude:latitude,venueLongitude:longitude}:{})};
}
export function matchLocation(match:any) {
 const place=[match?.venue,match?.city,match?.country].filter(Boolean);
 return place.length?[...new Set(place)].join(' · '):'Место проведения пока не указано';
}

/** UI timestamp adapter for ISO PostgreSQL timestamps; no backend SDK dependency. */
export class Timestamp {
 constructor(readonly seconds:number,readonly nanoseconds:number) {}
 static fromMillis(ms:number) {return new Timestamp(Math.floor(ms/1000),Math.floor(((ms%1000)+1000)%1000)*1000000)}
 static fromDate(date:Date) {return Timestamp.fromMillis(date.getTime())}
 static now() {return Timestamp.fromMillis(Date.now())}
 toMillis() {return this.seconds*1000+this.nanoseconds/1000000}
 toDate() {return new Date(this.toMillis())}
 isEqual(other:Timestamp) {return this.seconds===other.seconds&&this.nanoseconds===other.nanoseconds}
 valueOf() {return String(this.toMillis()).padStart(16,'0')}
 toJSON() {return {seconds:this.seconds,nanoseconds:this.nanoseconds,type:'Timestamp'}}
}
export function timestamp(value:unknown):Timestamp {
 if(value instanceof Timestamp)return value
 if(typeof value==='string'&&Number.isFinite(Date.parse(value)))return Timestamp.fromMillis(Date.parse(value))
 throw new Error('Invalid stored timestamp')
}

import {randomBytes,timingSafeEqual,createHash} from 'node:crypto';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const newPassword=()=>randomBytes(18).toString('base64url');
export async function passwordHash(password,salt=randomBytes(16).toString('hex')){
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},material,256);
 return {salt,hash:Buffer.from(bits).toString('hex')};
}
export async function verifyPassword(password,salt,expected){if(typeof password!=='string'||password.length>256||typeof expected!=='string')return false;const {hash}=await passwordHash(password,salt);return hash.length===expected.length&&timingSafeEqual(Buffer.from(hash),Buffer.from(expected));}

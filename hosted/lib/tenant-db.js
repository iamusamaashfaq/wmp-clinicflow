// Only server-generated UUIDs are accepted; tenant selection never comes from a cookie/body.
export function tenantSql(sql,clinicId){
 if(!/^[a-f0-9-]{36}$/.test(clinicId))throw Error('Invalid clinic identity.');
 const id="'"+clinicId+"'";
 for(const table of ['clinic_state','integration'])if(new RegExp('\\b'+table+'\\b').test(sql))return sql.replace(new RegExp('\\b'+table+'\\b','g'),'tenant_'+table).replace(/\(id,/,'(clinic_id,').replace(/VALUES\(1,/,`VALUES(${id},`).replace(/\bid=1\b/g,`clinic_id=${id}`);
 for(const table of ['staff_sessions','subscribers'])if(new RegExp('\\b'+table+'\\b').test(sql)){
  let scoped=sql.replace(new RegExp('\\b'+table+'\\b','g'),'tenant_'+table);
  if(/^INSERT/i.test(scoped))return scoped.replace(/\((token|id),/,'(clinic_id,$1,').replace(/VALUES\(/,`VALUES(${id},`);
  if(!/\bWHERE\b/.test(scoped))throw Error('Unscoped tenant query rejected.');
  return scoped.replace(/\bWHERE\b/,`WHERE clinic_id=${id} AND`);
 }
 if(/\brate_limits\b/.test(sql))return sql; // The API hashes clinic identity into each rate-limit key.
 throw Error('Unexpected tenant database query.');
}
export function tenantDb(db,clinicId){return {prepare:sql=>db.prepare(tenantSql(sql,clinicId)),batch:statements=>db.batch(statements)};}

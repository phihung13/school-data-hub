import pg from 'pg';
const c = new pg.Client({connectionString:'postgres://postgres:postgres@localhost:5434/hub_dev'});
await c.connect();
console.log('users:', JSON.stringify((await c.query("select id, auth_uid, full_name from core.users order by full_name")).rows,null,1));
console.log('parents:', JSON.stringify((await c.query("select * from core.parents")).rows,null,1));
console.log('parent_students:', JSON.stringify((await c.query("select * from core.parent_students")).rows,null,1));
console.log('current_user_id def:', (await c.query("select pg_get_functiondef('core.current_user_id'::regproc) d")).rows[0].d);
await c.end();

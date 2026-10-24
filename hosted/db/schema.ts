import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const clinicState=sqliteTable('clinic_state',{id:integer('id').primaryKey(),value:text('value').notNull(),revision:integer('revision').notNull().default(0)});
export const staffSessions=sqliteTable('staff_sessions',{token:text('token').primaryKey(),expires:integer('expires').notNull()});
export const rateLimits=sqliteTable('rate_limits',{key:text('key').primaryKey(),count:integer('count').notNull().default(0),expires:integer('expires').notNull()});
export const subscribers=sqliteTable('subscribers',{id:text('id').primaryKey(),expires:integer('expires').notNull()});
export const integration=sqliteTable('integration',{id:integer('id').primaryKey(),sent:integer('sent').notNull().default(0),received:integer('received').notNull().default(0),lastDelivery:integer('last_delivery'),error:text('error')});

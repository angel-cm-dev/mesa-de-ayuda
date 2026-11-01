import type { Knex } from 'knex';

/**
 * Esquema inicial. Los identificadores son UUID generados en la aplicación
 * (no autoincrementales) para no exponer volumen de datos y poder crear
 * registros antes de insertarlos (útil dentro de transacciones).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary();
    t.string('name', 120).notNullable();
    t.string('email', 160).notNullable().unique();
    t.string('password_hash', 100).notNullable();
    t.string('role', 20).notNullable().index();
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamp('last_assigned_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable();
  });

  await knex.schema.createTable('categories', (t) => {
    t.uuid('id').primary();
    t.string('name', 80).notNullable().unique();
    t.string('description', 300).nullable();
    t.boolean('active').notNullable().defaultTo(true);
  });

  await knex.schema.createTable('sla_policies', (t) => {
    t.string('priority', 20).primary();
    t.float('response_hours').notNullable();
    t.float('resolution_hours').notNullable();
  });

  await knex.schema.createTable('tickets', (t) => {
    t.uuid('id').primary();
    t.integer('number').notNullable().unique();
    t.string('title', 150).notNullable();
    t.text('description').notNullable();
    t.string('status', 20).notNullable().index();
    t.string('priority', 20).notNullable().index();
    t.uuid('category_id').nullable().references('id').inTable('categories').onDelete('SET NULL');
    t.uuid('requester_id').notNullable().references('id').inTable('users').index();
    t.uuid('assignee_id').nullable().references('id').inTable('users').index();
    t.timestamp('response_due_at', { useTz: true }).notNullable();
    t.timestamp('resolution_due_at', { useTz: true }).notNullable();
    t.timestamp('first_response_at', { useTz: true }).nullable();
    t.timestamp('sla_paused_at', { useTz: true }).nullable();
    t.boolean('sla_breached').notNullable().defaultTo(false);
    t.timestamp('resolved_at', { useTz: true }).nullable();
    t.timestamp('closed_at', { useTz: true }).nullable();
    t.integer('reopen_count').notNullable().defaultTo(0);
    t.timestamp('created_at', { useTz: true }).notNullable().index();
    t.timestamp('updated_at', { useTz: true }).notNullable();
  });

  await knex.schema.createTable('ticket_comments', (t) => {
    t.uuid('id').primary();
    t.uuid('ticket_id').notNullable().references('id').inTable('tickets').onDelete('CASCADE').index();
    t.uuid('author_id').notNullable().references('id').inTable('users');
    t.text('body').notNullable();
    t.boolean('internal').notNullable().defaultTo(false);
    t.timestamp('created_at', { useTz: true }).notNullable();
  });

  await knex.schema.createTable('ticket_attachments', (t) => {
    t.uuid('id').primary();
    t.uuid('ticket_id').notNullable().references('id').inTable('tickets').onDelete('CASCADE').index();
    t.uuid('uploaded_by').notNullable().references('id').inTable('users');
    t.string('original_name', 255).notNullable();
    t.string('stored_name', 300).notNullable();
    t.string('mime_type', 120).notNullable();
    t.integer('size_bytes').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable();
  });

  // Tabla de auditoría "append-only": nunca se actualiza ni borra desde la aplicación.
  await knex.schema.createTable('ticket_events', (t) => {
    t.uuid('id').primary();
    t.uuid('ticket_id').notNullable().references('id').inTable('tickets').onDelete('CASCADE').index();
    t.uuid('actor_id').nullable().references('id').inTable('users');
    t.string('action', 40).notNullable();
    t.string('from_value', 255).nullable();
    t.string('to_value', 255).nullable();
    t.text('details').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable();
  });

  await knex.schema.createTable('surveys', (t) => {
    t.uuid('id').primary();
    t.uuid('ticket_id').notNullable().unique().references('id').inTable('tickets').onDelete('CASCADE');
    t.integer('rating').notNullable().checkBetween([1, 5]);
    t.text('comment').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable();
  });

  await knex.schema.createTable('kb_articles', (t) => {
    t.uuid('id').primary();
    t.string('title', 150).notNullable();
    t.string('slug', 100).notNullable().unique();
    t.text('content').notNullable();
    t.uuid('category_id').nullable().references('id').inTable('categories').onDelete('SET NULL');
    t.uuid('author_id').notNullable().references('id').inTable('users');
    t.boolean('published').notNullable().defaultTo(false).index();
    t.integer('views').notNullable().defaultTo(0);
    t.timestamp('created_at', { useTz: true }).notNullable();
    t.timestamp('updated_at', { useTz: true }).notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  for (const table of ['kb_articles', 'surveys', 'ticket_events', 'ticket_attachments', 'ticket_comments', 'tickets', 'sla_policies', 'categories', 'users']) {
    await knex.schema.dropTableIfExists(table);
  }
}

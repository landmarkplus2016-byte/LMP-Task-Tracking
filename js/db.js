const db = new Dexie('ProjectTrackerDB');

db.version(1).stores({
  users: '++id, name, email, password_hash, role, prefix, is_active, created_at, must_change_password, deactivated_at, deactivated_by',
  tasks: '&id, coordinator_id, status, region, vendor, job_code, physical_site_id, done_date, is_deleted, is_locked',
  catalogs: '++id, year, valid_from, valid_to, created_by, notes',
  catalog_items: '++id, catalog_id, code, name, category, price, is_active',
  general_streams: '++id, year, valid_from, stream_name, is_active',
  contractor_portions: '++id, contractor_name, lmp_pct, contractor_pct, valid_from, created_by, notes',
  task_templates: '++id, name, description, created_by, created_at, updated_at, is_active',
  task_template_items: '++id, template_id, line_item_code, default_qty, sort_order',
  audit_log: '++id, task_id, user_id, action, field_name, old_value, new_value, timestamp, source_file',
  app_settings: '&key, value, updated_at'
});

async function runSeed() {
  const userCount = await db.users.count();
  if (userCount === 0) {
    return { needsSetup: true };
  }
  return { needsSetup: false };
}

async function purgeSoftDeleted() {
  const cutoff = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const allTasks = await db.tasks.toArray();
  const toPurge = allTasks.filter(t => t.is_deleted && t.deleted_at && new Date(t.deleted_at) < cutoff);
  const ids = toPurge.map(t => t.id);

  if (ids.length) {
    await db.tasks.bulkDelete(ids);
  }

  await db.app_settings.put({
    key: 'last_purge',
    value: { timestamp: new Date(), count: ids.length },
    updated_at: new Date()
  });

  return ids.length;
}

db.on('ready', purgeSoftDeleted);

window.db = db;
window.runSeed = runSeed;
window.purgeSoftDeleted = purgeSoftDeleted;

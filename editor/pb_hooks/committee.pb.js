onBootstrap((e) => {
  e.next();
  e.app.runAllMigrations();
  const c = e.app.findCollectionByNameOrId('committee_users');
  const clientId = $os.getenv('GOOGLE_CLIENT_ID');
  const clientSecret = $os.getenv('GOOGLE_CLIENT_SECRET');
  c.oauth2 = {
    enabled: !!(clientId && clientSecret),
    providers:
      clientId && clientSecret
        ? [{ name: 'google', clientId, clientSecret }]
        : [],
  };
  c.passwordAuth = { enabled: false };
  c.otp = { enabled: false };
  c.createRule = '@request.context = "oauth2"';
  e.app.save(c);
});
onRecordAuthWithOAuth2Request((e) => {
  const access = require(__hooks + '/access.js');
  const u = e.oAuth2User;
  if (
    e.providerName !== 'google' ||
    !u ||
    u.rawUser.email_verified !== true ||
    !u.email ||
    access.emails().indexOf(u.email.trim().toLowerCase()) < 0
  )
    throw new ForbiddenError('Verified allowlisted Google identity required.');
  if (
    e.record &&
    e.record.email().trim().toLowerCase() !== u.email.trim().toLowerCase()
  )
    throw new ForbiddenError('Identity mismatch.');
  e.createData = { email: u.email.trim().toLowerCase() };
  u.email = u.email.trim().toLowerCase();
  e.next();
}, 'committee_users');
onRecordAuthRequest((e) => {
  require(__hooks + '/access.js').check(e.app, e.record);
  e.next();
}, 'committee_users');
onRecordAuthRefreshRequest((e) => {
  require(__hooks + '/access.js').check(e.app, e.record);
  e.next();
}, 'committee_users');
onRecordsListRequest((e) => {
  require(__hooks + '/access.js').check(e.app, e.auth);
  e.next();
}, 'profiles');
onRecordViewRequest((e) => {
  require(__hooks + '/access.js').check(e.app, e.auth);
  e.next();
}, 'profiles');
onRecordCreateRequest((e) => {
  require(__hooks + '/access.js').check(e.app, e.auth);
  e.next();
}, 'profiles');
onRecordUpdateRequest((e) => {
  require(__hooks + '/access.js').check(e.app, e.auth);
  e.next();
}, 'profiles');
onRecordDeleteRequest((e) => {
  require(__hooks + '/access.js').check(e.app, e.auth);
  e.next();
}, 'profiles');
routerAdd(
  'POST',
  '/api/gcom/reorder',
  (e) => {
    require(__hooks + '/access.js').check(e.app, e.auth);
    const ids = e.requestInfo().body.ids;
    if (
      !Array.isArray(ids) ||
      ids.length > 100 ||
      !ids.every((x) => typeof x === 'string' && /^[a-z0-9]{15}$/.test(x)) ||
      new Set(ids).size !== ids.length
    )
      throw new BadRequestError('Invalid roster order.');
    e.app.runInTransaction((app) => {
      const records = app.findRecordsByFilter('profiles', '', '', 101, 0);
      if (
        records.length !== ids.length ||
        !records.every((x) => ids.indexOf(x.id) >= 0)
      )
        throw new BadRequestError('Roster changed. Reload before reordering.');
      records.forEach((record) => {
        record.set('position', ids.indexOf(record.id));
        app.save(record);
      });
    });
    return e.json(200, { saved: true });
  },
  $apis.requireAuth('committee_users'),
);

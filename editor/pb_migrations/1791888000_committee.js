migrate((app) => {
  const users = new Collection({name: 'committee_users', type: 'auth',
    listRule: null, viewRule: null, createRule: '@request.context = "oauth2"', updateRule: null, deleteRule: null,
    authRule: 'verified = true', passwordAuth: {enabled: false}, otp: {enabled: false},
    oauth2: {enabled: false}, fields: []});
  app.save(users);
  const rule = '@request.auth.collectionName = "committee_users" && @request.auth.verified = true';
  app.save(new Collection({name: 'profiles', type: 'base', listRule: rule, viewRule: rule,
    createRule: rule, updateRule: rule, deleteRule: rule, fields: [
      {type:'text', name:'name', required:true, max:80},
      {type:'text', name:'role', required:true, max:100},
      {type:'text', name:'photo', max:100},
      {type:'json', name:'links', maxSize:4000},
      {type:'number', name:'position', min:0, max:1000, onlyInt:true}
    ]}));
}, (app) => {
  app.delete(app.findCollectionByNameOrId('profiles'));
  app.delete(app.findCollectionByNameOrId('committee_users'));
});

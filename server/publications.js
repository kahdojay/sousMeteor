Meteor.publish('messages', function(teamIds) {
  // console.log('TEAM IDS', teamIds)
  return Messages.find({teamId: {$in: teamIds}}, {sort: {createdAt: 1}, limit:20});
});
Meteor.publish('teams', function(userId) {
  return Teams.find({users: {$in: [userId]}});
});
Meteor.publish('purveyors', function(teamId) {
  return Purveyors.find();
  // TODO: limit by teamId
  // return Purveyors.find({teamId: teamId});
});
Meteor.publish('categories', function(teamId) {
  return Categories.find();
  // TODO: limit by teamId
  // return Categories.find({teamId: teamId});
});
Meteor.publish('products', function(purveyorList) {
  return Products.find();
  // TODO: limit by teamId
  // return Products.find({purveyors: {$in: purveyorList}});
});
Meteor.publish('errors', function(userId) {
  return Errors.find({userId: userId});
});
Meteor.publish('restricted', function(phoneNumber) {
  var users = Meteor.users.find({username: phoneNumber},{fields: {
    smsToken: 0,
    password: 0,
    services: 0
  }});
  return users;
});

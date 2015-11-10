Meteor.publish('messages', function(teamIds) {
  // console.log('TEAM IDS', teamIds)
  //TODO limit 20 for each teamId in teamIds
  return Messages.find({teamId: {$in: teamIds}}, {sort: {createdAt: -1}, limit:20});
});
Meteor.publish('teams', function(userId) {
  return Teams.find({users: {$in: [userId]}});
});
Meteor.publish('teams-users', function(teamIds){
  var teamUsers = Teams.find({_id: {$in: teamIds}}, {
    fields: {
      users: 1
    }
  }).fetch();
  var userIds = {}
  teamUsers.forEach(function(team){
    team.users.forEach(function(userId){
      userIds[userId] = true;
    }.bind(this))
  }.bind(this))
  return Meteor.users.find({_id: {$in: Object.keys(userIds)}}, {
    fields: {
      firstName: 1,
      lastName: 1,
      username: 1
    }
  });
});
Meteor.publish('purveyors', function(teamIds) {
  return Purveyors.find({teamId: teamIds});
});
Meteor.publish('categories', function(teamIds) {
  return Categories.find({teamId: {$in: teamIds}});
});
Meteor.publish('products', function(teamIds) {
  return Products.find({teamId: {$in: teamIds}});
});
Meteor.publish('errors', function(userId) {
  return Errors.find({userId: userId});
});
Meteor.publish('restricted', function(phoneNumber) {
  var users = Meteor.users.find({username: phoneNumber},{
    fields: {
      smsToken: 0,
      password: 0,
      services: 0
    }
  });
  return users;
});

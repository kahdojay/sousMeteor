Meteor.publish('messages', function(teamId) {
  return Messages.find();
});

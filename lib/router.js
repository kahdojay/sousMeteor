Router.route('/', {
  name: 'home',
  waitOn: function() {
    Meteor.subscribe('messages');
  },
  data: function() {
    return Messages.find()
  }
});

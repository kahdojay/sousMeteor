Router.route('/', {
  name: 'home',

  data: function() {
    return [
      Messages.find(),
      Teams.find(),
      Purveyors.find()
    ]
  }
});

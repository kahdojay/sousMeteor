Router.route('/', {
  name: 'home',

  data: function() {
    return [
      Messages.find(),
      Stations.find(),
      Purveyors.find()
    ]
  }
});

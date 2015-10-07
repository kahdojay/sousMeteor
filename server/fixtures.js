if (Messages.find().count() === 0) {
  Messages.insert({
    message: "Hello world",
    author: "Tom",
    imageUrl: "",
    createdAt: new Date()
  });
  Messages.insert({
    message: "Hey Tom, what's up?",
    author: "Harry",
    imageUrl: "",
    createdAt: new Date()
  });
  Messages.insert({
    message: "Hey guys from Cleveland",
    author: "Ilya",
    imageUrl: "",
    createdAt: new Date()
  });
  Messages.insert({
    message: "Hey it's me, Don",
    author: "Don",
    imageUrl: "",
    createdAt: new Date()
  });
  Messages.insert({
    message: "Hey Don",
    author: "Brian",
    imageUrl: "",
    createdAt: new Date()
  });
  Messages.insert({
    message: "Hi Brian",
    author: "Tom",
    imageUrl: "",
    createdAt: new Date()
  });
  Messages.insert({
    message: "Hey guys, Netflix and chill?",
    author: "Harry",
    imageUrl: "",
    createdAt: new Date()
  });
  Messages.insert({
    message: "What?",
    author: "Ilya",
    imageUrl: "",
    createdAt: new Date()
  });
  Messages.insert({
    message: "I don't know",
    author: "Don",
    imageUrl: "",
    createdAt: new Date()
  });
  Messages.insert({
    message: "Bye-bye",
    author: "Brian",
    imageUrl: "",
    createdAt: new Date()
  });
}

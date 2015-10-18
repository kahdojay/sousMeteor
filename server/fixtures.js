if (Products.find().count() === 0) {
 var units = ['ea', 'cs', 'bu', 'lb']
 var products = [
   'Blue, Pt. Reyes bay', 'Blue, Pt. Reyes farmstead', 'Butter, unsalted', 'Buttermilk', 'Cream, heavy, clover', 'Crème fraiche, kendall farms', 'Eggs, xlrg', 'Fage total', 'Marscapone, zanetti', 'Mascarpone, bel gioso', 'Milk, whole, stauss barista', 'Mozzerella, pt reyes', 'Parmesan reggiano', 'Pecorino romano', 'Pecorino sardo, matica', 'Pecorino toscano fresco, il forteto', 'Pecorino, sardo fiore', 'Provolone, aged', 'Ricotta, whey, bellwether', 'Ricotta solatta',
   'Sotocenere tartufo, small', 'Taleggio', 'Coppa piquante', 'Guanciale', 'Mortadella', 'Pancetta, la quercia', 'Prosciutto americano, LQ boneless', 'Proscuitto, acorn, LQ boneless', 'Proscuitto, san daniele 16 mo', 'Speck americano, LQ boneless', 'Speck, alto adige', 'Bottarga, mullet', 'Lardo, LQ', 'Blue, Pt. Reyes bay, cow', 'Dry jack reserve, cow', 'Funky bleats, goat', 'Gorganzola piquante', 'Nerina, agri langa, goat', 'Pecorino ginepro, sheep', 'Pecorino, brillo chianti, sheep',
   'Red  hawk, cow', 'Sophia, goat', 'Strachittund val tellegio, cow', 'Taleggio valsassina, cow', 'Taleggio, casarrigoni fresca', 'Taleggio, DOP', 'Anchovies, recca/ortiz', 'Baking powder', 'Calabrian chiles, whole', 'Capers, salt packed, lilliput', 'Chickpeas', 'Chocolate, dark, tcho', 'Chocolate, white', 'Cocoa, tcho', 'Colatura, iasa', 'Cornichons', 'Cornmeal, semi-fine yellow', 'Cornstarch', 'Farro', 'Flour, 14%, unbleached, giusto\'s',
   'Flour, ap', 'Flour, semolina rimacinata, molino pasini', 'Geletatin sheets', 'Lady fingers, bonomi', 'Mustard, dijon', 'Nuts, almonds, natural', 'Nuts, hazelnuts, raw', 'Nuts, pinenuts, raw', 'Nuts, walnut pieces', 'Oil, capezzana', 'Oil, extra virgin, titone', 'Oil, fiordiolo', 'Oil, grapeseed', 'Oil, lemon agrumato', 'Oil, olio nuevo', 'Oil, olio verde', 'Oil, peanut', 'Oil, santa chiara', 'Oil, seka black 9L', 'Oil, seka green 9L',
   'Olives, black cured', 'Olives, castleveltrano, pitted', 'Olives, catleveltrano', 'Olives, taggiasca', 'PG tips', 'Quinoa, black', 'Raisins, golden/mix', 'Salt, jacobsen/maldon', 'Salt, kosher', 'Salt, trapani sea', 'Seeds, pumpkin raw', 'Seeds, white sesame', 'Sugar, confectioners', 'Sugar, demerara', 'Sugar, granulated', 'Sugar, trimoline', 'Tomatoes, bianco', 'Tuna, chunk in oil', 'Tuna, flott/ortiz', 'Vanilla extract',
 ];
 products.map(function(productName) {
   Products.insert({
     name: productName,
     description: '',
     price: 0.0,
     amount: 1,
     unit: units[Math.floor(Math.random()*units.length)],
     deleted: false,
   });
 });
}

if (Categories.find().count() === 0) {
 var allProducts = Products.find()
 var categories = [
   'Dry Goods', 'Spices & Herbs', 'Paper', 'Chemicals', 'Bar',
   'Cheese Board', 'Cured Meats', 'Bread', 'Herbs', 'Produce'
 ];
 categories.map(function(categoryName) {
   Categories.insert({
     name: categoryName,
     products: []
   })
 });
 var allCategories = Categories.find().fetch();
 console.log(allCategories);
 allProducts.map(function(product){
   var randomCategoryId = allCategories[Math.floor(Math.random()*allCategories.length)]._id;
   Categories.update({_id: randomCategoryId}, {$push: {products: product._id}});
 });
}

//
// if (Recipes.find().count() === 0) {
//   Recipes.insert({
//     name: 'Chilli Oil',
//     ingredients: []
//   });
//   Recipes.insert({
//     name: 'Red Curry Paste',
//     ingredients: []
//   });
//   Recipes.insert({
//     name: 'Roasted Eggplant',
//     ingredients: []
//   });
// }

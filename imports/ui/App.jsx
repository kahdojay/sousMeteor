import React, { Component } from 'react'
import { createContainer } from 'meteor/react-meteor-data'

class App extends Component {
	render() {
		return (
			<div className="container">
				<header>
				  <h1>Sous</h1>
				</header>
			</div>
		)
	}
}

export default createContainer(() => {
	return {
		currentUser: Meteor.user(),
	}
}, App)
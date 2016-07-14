import React, { Component } from 'react'
import ReactDOM from 'react-dom'
import { createContainer } from 'meteor/react-meteor-data'

import AddUserToTeams from './AddUserToTeams'
import AddUserToUsersTeams from './AddUserToUsersTeams'
import AuthForm from './AuthForm'
import FormSelector from './FormSelector'
import ImportPurveyors from './ImportPurveyors'
import ImportProducts from './ImportProducts'
import ImportTeams from './ImportTeams'

class App extends Component {
  constructor(props) {
    super(props)

    this.stateForms = {
      'addToTeams': <AddUserToTeams/>,
      'addToUsersTeams': <AddUserToUsersTeams/>,
      'importPurveyors': <ImportPurveyors/>,
      'importProducts': <ImportProducts/>,
      'importTeams': <ImportTeams/>,
    }

    this.state = {
      importType: 'addToTeams',
      authenticated: false,
      showForm: 'addToTeams',
    }
  }

  getForm(formKey) {
    return this.stateForms[formKey] ? this.stateForms[formKey] : AddUserToTeams
  }

  switchForm(e) {
    this.setState({ showForm: e.target.value })
  }

  submitPass(pass) {
    Meteor.call('submitPass', pass, (err, res) => {
      if (res === true) {
        this.setState({ authenticated: true })
      }
    })
  }

  render() {
    var ShowForm =  this.state.authenticated ? 
                    this.getForm(this.state.showForm) 
                    : <AuthForm submitPass={this.submitPass.bind(this)} />

    return (
      <div className="container">
        <header>
          <h1>Sous</h1>
          { this.state.authenticated ? 
            <FormSelector switchForm={this.switchForm.bind(this)} /> 
            : <div></div>
          }
        </header>
        {ShowForm}
      </div>
    )
  }
}

export default createContainer(() => {
  return {
    currentUser: Meteor.user(),
  }
}, App)
import React, { Component } from 'react'
import { Meteor } from 'meteor/meteor'

export default class FormSelector extends Component {
  render() {
    return (
      <div className="dropdown">
        <select 
          onChange={this.props.switchForm}
        >
          <option value="addToTeams">Add To Teams</option> 
          <option value="addToUsersTeams">Add To Another User's Teams</option>
          <option value="importPurveyors">Import Purveyors</option>
        </select>
      </div>
    )
  }
}
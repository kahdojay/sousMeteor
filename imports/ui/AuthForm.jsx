import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import { Meteor } from 'meteor/meteor';

export default class AuthForm extends Component {
  handleSubmit(e) {
    e.preventDefault();
    const pass = ReactDOM.findDOMNode(this.refs.password).value.trim();
    this.props.submitPass(pass)
  }

  render() {
    return (
      <div>
        <form 
          onSubmit={this.handleSubmit.bind(this)} 
        >
          <div>
            <label className="password">
              Password
              <input
                type="password"
                ref="password"
              />
            </label>
          </div>
          <button type="submit">Submit</button>
        </form>
      </div>
    )
  }
}
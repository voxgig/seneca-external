/* Copyright (c) 2018 voxgig and other contributors, MIT License */
'use strict'


const Util = require('util')


module.exports = external

external.defaults = {
  pins: []
}

function external(options) {

  // TODO: needs to be a seneca feature
  intern.error = this.util.Eraro({
    package: 'seneca',
    override: true,
    msgmap: external.errors
  })
  
  // only allow messages where custom.secret matches
  const secret = null == options.secret ? '' : options.secret
  
  // normalize the list of pins
  var pins = options.pin || options.pins
  pins = Array.isArray(pins) ? pins : pins.split(/\s*;\s*/)
  pins = pins.map(pin => this.util.Jsonic(pin))

  const allow = this.util.Patrun({ gex: true })
  pins.forEach(pin => allow.add(pin, true))

  this.prepare(async function() {
    // NOTE: must follow handling of message custom meta data
    this.inward(function(ctxt, data) {
      const meta = data.meta

      if(0 === meta.parents.length) {
        meta.custom.external = Object.assign({
          safe: true,
          secret: secret,
          origin: ctxt.seneca.id
        }, data.meta.custom.external)

        // we orginated this message
        return
      }
      else {
        if(null != meta.custom.external &&
           !data.meta.custom.external.allow && 
           meta.custom.external.secret != secret)
        {
          return {
            kind: 'error',
            code: 'external-bad-secret'
          }
        }
      }

      // External messages are rejected unless white-listed
      if(null == data.meta.custom.external ||
         (!data.meta.custom.external.safe &&
          !data.meta.custom.external.allow)
        )
      {
        if(!allow.find(data.msg)) {
          return {
            kind: 'error',
            code: 'external-not-allowed'
          }
        }
        else {
          data.meta.custom.external = data.meta.custom.external || {}
          data.meta.custom.external.allow = true
        }
      }
    })
  })
  
  return {
    export: {
      allow: allow
    }
  }
}

external.errors = {
}

const intern = external.intern = {
}





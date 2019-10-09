/* Copyright (c) 2018 voxgig and other contributors, MIT License */
'use strict'

const Joi = require('@hapi/joi')

module.exports = external

external.errors = {
  no_secret:
    'No secret defined but secret_required is true. Options were: <%=opts%>'
}

external.defaults = {
  secret: Joi.string().default(null),
  secret_allows: Joi.boolean().default(false),
  secret_required: Joi.boolean().default(false),
  pins: []
}

function external(options) {
  // only allow messages where custom.secret matches
  const secret = options.secret

  // only need secret to allow messages
  const secret_allows = options.secret_allows

  // must have secret in all cases
  const secret_required = options.secret_required

  if (secret_required && null == secret) {
    this.fail('no_secret', { opts: options })
  }

  // normalize the list of pins
  var pins = options.pin || options.pins
  pins = Array.isArray(pins) ? pins : pins.split(/\s*;\s*/)
  pins = pins.map(pin => this.util.Jsonic(pin))

  const allow = this.util.Patrun({ gex: true })
  pins.forEach(pin => allow.add(pin, true))

  this.prepare(async function() {
    // TODO: seneca.has needs test and fix
    if (
      this.private$.actrouter.find(
        { role: 'web-handler', hook: 'custom' },
        true
      )
    ) {
      await this.post({
        role: 'web-handler',
        hook: 'custom',
        custom: function(custom) {
          custom.external = custom.external || {}
          custom.external.safe = false
        }
      })
    }

    // NOTE: must follow handling of message custom meta data
    this.inward(function(ctxt, data) {
      const remote = data.meta.remote
      const external = (data.meta.custom.external =
        data.meta.custom.external || {})

      // Allow any message if it originated locally
      if (remote) {
        external.safe = false
        external.allow = false
      } else {
        Object.assign(
          external,
          {
            safe: true,
            allow: true,
            secret: secret,
            origin: ctxt.seneca.id
          },
          external
        )
        return
      }

      // Disallow message if secrets don't match.
      if (null != external.secret && null != secret) {
        if (external.secret === secret) {
          external.allow = true
        } else if (!secret_allows) {
          return {
            kind: 'error',
            code: 'external-bad-secret'
          }
        }
      } else if (null == external.secret && secret_required) {
        return {
          kind: 'error',
          code: 'external-secret-required'
        }
      }

      // Allow messages if parent is allowed
      if (external.allow) {
        return
      }

      if ((null == secret || !secret_required) && allow.find(data.msg)) {
        external.allow = true
        return
      } else {
        return {
          kind: 'error',
          code: 'external-not-allowed'
        }
      }
    })

    // NOTE: important to log this at info level to rapidly debug service
    // communication failures. DON'T LOG SECRET!!!
    this.log.info(
      'pins',
      options.pins,
      'secret_allows',
      options.secret_allows,
      'secret_required',
      options.secret_required
    )
  })

  return {
    export: {
      allow: allow
    }
  }
}

//const intern = external.intern = {}

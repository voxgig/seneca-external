/* Copyright (c) 2018 voxgig and other contributors, MIT License */
'use strict'

module.exports = function(seneca) {
  return seneca.util.Eraro({
    package: 'seneca',
    override: true,
    msgmap: msgmap
  })
}

const msgmap = {
  foo: 'Foo! Message was: <%=msg%>',
}

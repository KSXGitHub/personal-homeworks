module.exports = name =>
  /(^|\\|\/)(.*\.)?(log|tmp|temp)($|[.\-_].*)/.test(name)

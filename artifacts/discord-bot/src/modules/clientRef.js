let _client = null;

export function setClient(client) {
  _client = client;
}

export function getClient() {
  return _client;
}

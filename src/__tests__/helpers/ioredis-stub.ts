// Stub for ioredis — used by vitest when ioredis is not installed
// This allows the health check route's dynamic import to resolve in tests

export default class MockRedis {
  connect = async () => {};
  ping = async () => 'PONG';
  quit = async () => 'OK';
  get = async () => null;
  set = async () => 'OK';
  del = async () => 0;
  exists = async () => 0;
  expire = async () => 1;
  ttl = async () => -1;
  incr = async () => 1;
  decr = async () => 0;
  hget = async () => null;
  hset = async () => 1;
  hdel = async () => 0;
  lpush = async () => 1;
  rpush = async () => 1;
  lrange = async () => [];
  sadd = async () => 1;
  smembers = async () => [];
  srem = async () => 1;
  keys = async () => [];
  flushall = async () => 'OK';
  on = () => this;
  once = () => this;
  removeAllListeners = () => this;
  disconnect = () => {};
}

function createThenable(result) {
  return {
    select() {
      return this;
    },
    order() {
      return this;
    },
    eq() {
      return this;
    },
    in() {
      return this;
    },
    gte() {
      return this;
    },
    lte() {
      return this;
    },
    or() {
      return this;
    },
    limit() {
      return this;
    },
    update() {
      return this;
    },
    delete() {
      return this;
    },
    insert() {
      return this;
    },
    upsert() {
      return this;
    },
    maybeSingle() {
      return Promise.resolve(result);
    },
    single() {
      return Promise.resolve(result);
    },
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    },
    catch(reject) {
      return Promise.resolve(result).catch(reject);
    },
    finally(cb) {
      return Promise.resolve(result).finally(cb);
    },
  };
}

export function createSupabaseMock(tableResults = {}) {
  const defaultResult = { data: [], error: null };

  return {
    from(table) {
      return createThenable(tableResults[table] || defaultResult);
    },
    rpc() {
      return Promise.resolve({ data: null, error: null });
    },
    auth: {
      getUser() {
        return Promise.resolve({
          data: { user: { id: "test-user", email: "test@example.com" } },
          error: null,
        });
      },
    },
  };
}

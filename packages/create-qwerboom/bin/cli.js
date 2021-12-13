#!/usr/bin/env node

require('../lib/create').run().then(() => {
  process.exit(0);
}).catch(error => {
  console.error(error);
  process.exit(1);
});

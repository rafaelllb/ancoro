const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

p.project.findMany()
  .then(r => {
    console.log('PROJECTS:', JSON.stringify(r, null, 2));
  })
  .catch(e => {
    console.error('ERROR:', e.message);
    console.error('STACK:', e.stack);
  })
  .finally(() => p.$disconnect());

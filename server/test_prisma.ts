import prisma from './src/config/prisma';
async function main() {
  try {
    const user = await prisma.user.findFirst();
    console.log(user);
  } catch (e) {
    console.error(e);
  }
}
main();

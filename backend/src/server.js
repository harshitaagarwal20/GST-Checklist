const app = require("./app");

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Backend API running on http://localhost:${PORT}`);
});

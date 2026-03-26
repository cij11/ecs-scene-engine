const canvas = document.getElementById("game") as HTMLCanvasElement;
canvas.width = 800;
canvas.height = 600;

const ctx = canvas.getContext("2d")!;
ctx.fillStyle = "#222";
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = "#fff";
ctx.font = "24px monospace";
ctx.textAlign = "center";
ctx.fillText("ECS Scene Engine", canvas.width / 2, canvas.height / 2);

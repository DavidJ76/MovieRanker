const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");
const message = document.getElementById("message");

// Handle registration.
if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("username").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        message.textContent = data.error;
        return;
      }

      window.location.href = "/login.html?registered=1";
    } catch (error) {
      message.textContent = "Could not connect to the server.";
    }
  });
}

// Handle login.
if (loginForm) {
  if (new URLSearchParams(window.location.search).has("registered")) {
    message.textContent = "Registration successful. Please log in.";
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        message.textContent = data.error;
        return;
      }

      window.location.href = "/";
    } catch (error) {
      message.textContent = "Could not connect to the server.";
    }
  });
}

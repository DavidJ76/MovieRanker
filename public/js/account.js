async function loadAccount() {
  const accountArea = document.getElementById("accountArea");

  try {
    const response = await fetch("/api/me", {
      cache: "no-store",
    });

    if (response.status === 401) {
      accountArea.replaceChildren();

      const login = document.createElement("a");
      login.href = "/login.html";
      login.textContent = "Login";

      const register = document.createElement("a");
      register.href = "/register.html";
      register.textContent = "Register";
      register.style.marginLeft = "15px";

      accountArea.append(login, register);
      return;
    }

    if (!response.ok) {
      throw new Error("Account request failed");
    }

    const data = await response.json();

    accountArea.replaceChildren();

    const welcome = document.createElement("span");
    welcome.textContent = `Welcome, ${data.user.username}! `;

    const logoutButton = document.createElement("button");
    logoutButton.textContent = "Logout";

    logoutButton.addEventListener("click", async () => {
      const result = await fetch("/api/logout", {
        method: "POST",
      });

      if (result.ok) {
        window.location.reload();
      } else {
        alert("Logout failed. Please try again.");
      }
    });

    const profileLink = document.createElement("a");

    profileLink.href = "/profile.html";
    profileLink.textContent = "My Profile";

    accountArea.append(welcome, profileLink, logoutButton);
  } catch (error) {
    accountArea.textContent = "Account service unavailable.";
    console.error(error);
  }
}

loadAccount();

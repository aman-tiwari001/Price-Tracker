# Price Tracker deployment on Oracle Cloud Always Free

This guide deploys the backend directly on an Oracle Cloud VM using:

```text
Android app
    |
    | HTTPS :443
    v
Nginx reverse proxy
    |
    | private localhost connection
    v
Node.js + Express :5000
    |
    +-- Chromium/Puppeteer for browser-backed platform searches
```

This setup intentionally does not use Docker, PM2, MongoDB, or Redis. The VM is kept lightweight:
`systemd` manages the Node process, while Nginx handles the public HTTPS boundary.

## 1. Choose and create the Oracle VM

In Oracle Cloud Console, open **Compute → Instances → Create instance**.

Recommended Always Free configuration:

| Setting | Value | Why |
|---|---|---|
| Shape | `VM.Standard.A1.Flex` | ARM instance with good memory per free-tier resource |
| OCPU | 2 | Enough for a small personal deployment and browser work |
| Memory | 8 GB (12 GB if available within quota) | Chromium can use more memory than a normal API process |
| Image | Ubuntu 24.04 ARM64 | Supported Linux base for the VM |
| Boot volume | 50 GB, Balanced | Enough for the OS, Node dependencies, Chromium, logs, and builds |
| Public IPv4 | Enabled | Required for remote HTTPS traffic |

The application is suitable for personal or low-volume use. Each uncached search fans out to
multiple platforms, and some platforms use Chromium, so this is not a high-concurrency production
shape.

Create or select an SSH key pair during instance creation. Keep the private key only on your
computer; it is the credential that grants shell access to the VM.

## 2. Configure Oracle networking

In the VM's **Virtual Cloud Network → Subnet → Security List**, add these ingress rules:

| Protocol | Port | Source | Purpose |
|---|---:|---|---|
| TCP | 22 | Your IP address, if possible | SSH administration |
| TCP | 80 | `0.0.0.0/0` | HTTP and Let's Encrypt validation |
| TCP | 443 | `0.0.0.0/0` | Public HTTPS API traffic |

Do not open ports `5000`, `6379`, or `27017` to the internet. Port `5000` is the private Node
upstream, while `6379` and `27017` are Redis and MongoDB ports that are not needed here.

Oracle's security list is the cloud firewall. Later, Ubuntu's UFW firewall will provide a second
firewall layer inside the VM.

## 3. Connect and prepare Ubuntu

From your local computer, connect using the private key created for the VM:

```bash
ssh -i /path/to/private-key ubuntu@YOUR_VM_PUBLIC_IP
```

`ssh` creates an encrypted terminal session. The `ubuntu` user is the non-root account supplied by
the Ubuntu image; `sudo` is used only for administrative operations.

Update the package index and install security updates:

```bash
sudo apt update && sudo apt upgrade -y
```

`apt update` downloads the latest package metadata. `apt upgrade` installs available updates so the
new VM does not start with known outdated system packages.

Install basic deployment tools:

```bash
sudo apt install -y git curl ca-certificates build-essential openssl
```

These provide Git for source checkout, curl for downloads and health checks, trusted HTTPS
certificates, native build tools for Node packages, and OpenSSL for generating secrets.

Add 4 GB of swap:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Swap is disk-backed memory. It is slower than RAM, but it gives Chromium and Node a safety buffer
instead of immediately being killed during a memory spike. The `fstab` entry makes swap return after
reboot.

Verify memory and swap:

```bash
free -h
swapon --show
```

## 4. Install Node.js and Chromium

Install Node.js 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

The setup script adds the NodeSource package repository; `apt install` then installs the Node
runtime and npm. Node 20 matches the backend's tested runtime family.

Install the system browser used by Puppeteer:

```bash
sudo apt install -y chromium
chromium --version
which chromium
```

On some Ubuntu images the package is named `chromium-browser` instead. On Ubuntu installations
using Snap, `which chromium` may return `/snap/bin/chromium` rather than `/usr/bin/chromium`:

```bash
sudo apt install -y chromium-browser
```

Use whichever package exists. Record the path returned by:

```bash
which chromium
```

For a Snap installation, use `/snap/bin/chromium` in the commands below. The Snap wrapper launches
the installed Chromium revision; it is still the executable path that Puppeteer should receive.

The backend launches browser-backed adapters. If Puppeteer cannot find its bundled browser on ARM,
configure the browser launcher to pass:

```ts
executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
```

Then set `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` in the service environment. This points
Puppeteer at the VM's installed browser rather than relying on a downloaded binary. For the VM in this
deployment, set `PUPPETEER_EXECUTABLE_PATH=/snap/bin/chromium` if that is the path returned by
`which chromium`; use `/usr/bin/chromium` only when that is the actual result.

## 5. Check out the backend

For a private repository, use an SSH deploy key rather than putting a GitHub token in shell history.
Generate a read-only key on the VM:

```bash
ssh-keygen -t ed25519 -C "price-tracker-vm" -f ~/.ssh/price_tracker_deploy
cat ~/.ssh/price_tracker_deploy.pub
```

Add the displayed public key in GitHub under **Repository → Settings → Deploy keys**. Do not enable
write access. A read-only deploy key lets the VM pull releases without being able to push code.

Configure the GitHub host alias:

```bash
cat > ~/.ssh/config <<'EOF'
Host github-price-tracker
  HostName github.com
  User git
  IdentityFile ~/.ssh/price_tracker_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
```

The alias makes this checkout use the deployment key explicitly, preventing accidental use of a
different GitHub account.

Clone the branch:

```bash
cd ~
git clone --branch feat/quick-commerce-price-comparison \
  git@github-price-tracker:aman-tiwari001/Price-Tracker.git price-tracker
cd ~/price-tracker
```

Git copies the application source to the VM. The branch is selected explicitly so the deployed code
matches the reviewed feature branch.

## 6. Configure backend environment variables

Create the deployment environment file:

```bash
cd ~/price-tracker/backend
cp .env.example .env
nano .env
```

Use values like these:

```env
PORT=5000
MONGODB_URI=
JWT_SECRET=PASTE_A_RANDOM_SECRET_HERE

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
SEARCH_CACHE_TTL_SECONDS=300
PLATFORM_SESSION_TTL_SECONDS=43200
PLATFORM_SEARCH_TIMEOUT_MS=20000

PRICE_TRACKER_ENABLED_PLATFORM_ID_LIST=
PRICE_TRACKER_PROXY_URL=
PRICE_TRACKER_BIGBASKET_PROXY_URL=
PRICE_TRACKER_SERVER_ORIGIN=https://api.example.com
```

Generate a strong signing secret:

```bash
openssl rand -hex 32
```

Paste the output into `JWT_SECRET`. Never commit `.env`, print it in logs, or send it through chat.
MongoDB and Redis are intentionally blank/unavailable in this lightweight setup. Search falls back
to in-process caching; authentication data is not available without MongoDB, and cache/session data
is lost when the process restarts.

Restrict the environment file:

```bash
chmod 600 ~/price-tracker/backend/.env
```

Only the owner can read the file, which protects the JWT secret and proxy credentials.

## 7. Install dependencies and build

```bash
cd ~/price-tracker/backend
npm ci
npm run build
```

`npm ci` installs the exact versions from `package-lock.json`. `npm run build` compiles TypeScript
into `backend/dist`, the directory that systemd will run.

If the project has been updated, repeat these commands after pulling the new branch.

## 8. Run the backend with systemd

Create a service definition:

```bash
sudo nano /etc/systemd/system/price-tracker.service
```

Paste:

```ini
[Unit]
Description=Price Tracker API
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/price-tracker/backend
EnvironmentFile=/home/ubuntu/price-tracker/backend/.env
Environment=PUPPETEER_EXECUTABLE_PATH=/snap/bin/chromium
ExecStart=/usr/bin/node /home/ubuntu/price-tracker/backend/dist/index.js
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=30
LimitNOFILE=65536
TasksMax=512

[Install]
WantedBy=multi-user.target
```

`systemd` is Ubuntu's built-in process supervisor. It starts the API at boot, restarts it after a
crash, loads the protected environment file, and sends a graceful termination signal during
shutdown. It replaces PM2 without adding another runtime dependency.

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now price-tracker
sudo systemctl status price-tracker
```

`daemon-reload` makes systemd read the new unit. `enable` configures boot startup, and `--now`
starts it immediately.

View logs:

```bash
sudo journalctl -u price-tracker -f
```

Use `Ctrl+C` to leave the log view; it does not stop the service.

Test the private upstream:

```bash
curl http://127.0.0.1:5000/api
```

This confirms Node is listening locally before Nginx or DNS is involved.

## 9. Configure a domain and Nginx

You need a domain or subdomain such as `api.example.com`. At your DNS provider, create:

```text
Type: A
Name: api
Value: YOUR_VM_PUBLIC_IP
TTL: 300
```

An A record maps the human-readable hostname to the VM's public IPv4 address. Wait for DNS
propagation, then check it:

```bash
sudo apt install -y dnsutils
dig +short api.example.com
```

The result should be the VM's public IP.

Install Nginx and Certbot:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Nginx is the public reverse proxy. Certbot obtains and renews the TLS certificate, while its Nginx
plugin can update the proxy configuration safely.

Create the HTTP virtual host:

```bash
sudo nano /etc/nginx/sites-available/price-tracker
```

Replace `api.example.com` with your hostname:

```nginx
server {
    listen 80;
    listen [::]:80;

    server_name api.example.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 10s;
        proxy_send_timeout 180s;
        proxy_read_timeout 180s;
        client_max_body_size 10m;
    }
}
```

Nginx accepts public requests on port 80 and forwards them to Node on `127.0.0.1:5000`. The
timeouts are longer because a cold search can wait for browser-backed platform calls. The forwarded
headers preserve the original client and protocol information for the application and logs.

Enable and validate the site:

```bash
sudo ln -s /etc/nginx/sites-available/price-tracker \
  /etc/nginx/sites-enabled/price-tracker
sudo nginx -t
sudo systemctl reload nginx
```

The symlink enables the site. `nginx -t` checks syntax before reload; always run it first so a bad
configuration does not interrupt the running proxy.

## 10. Enable HTTPS

After DNS resolves and Oracle port 80 is open:

```bash
sudo certbot --nginx \
  -d api.example.com \
  --redirect \
  --agree-tos \
  -m YOUR_EMAIL@example.com
```

Certbot obtains a Let's Encrypt certificate, configures Nginx for TLS on port 443, and redirects
plain HTTP to HTTPS. The email receives renewal and expiry notices.

Verify automatic renewal:

```bash
sudo certbot renew --dry-run
```

Test the public API:

```bash
curl https://api.example.com/api
```

At this point the mobile client can use a secure, stable URL and port 5000 can remain private.

## 11. Enable the VM firewall

Configure Ubuntu's second firewall layer:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

UFW allows SSH and Nginx's HTTP/HTTPS ports while blocking other unsolicited traffic. Keep the
Oracle security-list rules and UFW rules consistent; a connection must pass both firewalls.

## 12. Configure and install the mobile app

On the development computer, create `frontend/.env`:

```env
EXPO_PUBLIC_SERVER_URL=https://api.example.com
```

Expo embeds `EXPO_PUBLIC_*` values into the app at build time. This URL is public application
configuration, not a secret; never put JWT keys or proxy credentials in frontend variables.

For local Expo testing:

```powershell
cd frontend
npm install
npx expo start
```

For an installable Android build:

```powershell
npx eas login
npx eas build:configure
npx eas build --platform android --profile preview
```

Install the generated APK on the phone. The app will call Nginx over HTTPS from any network rather
than trying to reach `localhost`, which would mean the phone itself.

## 13. Deploying a later backend update

Run on the VM:

```bash
cd ~/price-tracker
git pull origin feat/quick-commerce-price-comparison
cd backend
npm ci
npm run build
sudo systemctl restart price-tracker
sudo systemctl status price-tracker
sudo journalctl -u price-tracker -n 100 --no-pager
```

This pulls the latest reviewed code, installs locked dependencies, rebuilds JavaScript, restarts the
service, and prints recent logs. Nginx does not need to restart unless its configuration changes.

## 14. Useful diagnostics

```bash
# Is the Node service running?
sudo systemctl status price-tracker

# Recent backend errors
sudo journalctl -u price-tracker -n 100 --no-pager

# Is Node listening only on the private upstream port?
sudo ss -ltnp | grep ':5000'

# Is Nginx listening publicly?
sudo ss -ltnp | grep -E ':(80|443)'

# Nginx configuration and recent errors
sudo nginx -t
sudo tail -n 100 /var/log/nginx/error.log

# Memory pressure, especially after browser-backed searches
free -h
swapon --show
```

The expected network boundary is Nginx on `80/443` and Node on `127.0.0.1:5000`; Node should not
be directly exposed through the Oracle security list.

## 15. Operational limitations

- Without Redis, search caching and platform sessions are in-process and disappear on restart.
- Without MongoDB, authentication routes cannot persist users or roles.
- BigBasket may require `PRICE_TRACKER_BIGBASKET_PROXY_URL` because its network can block the VM
  source address.
- Chromium searches are CPU and memory intensive; monitor `free -h` and keep the browser pool
  limits intact.
- This free-tier VM is intended for personal or low-volume usage, not high-concurrency traffic.
- Keep `.env`, SSH private keys, GitHub tokens, and cloud credentials out of Git and chat.

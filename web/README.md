# Next.js SSR Template for Elastic Beanstalk

A template for Next.js SSR applications deployed on AWS Elastic Beanstalk with Node.js 20, using Next.js 15.3.1 and specific configurations.

## Purpose
This repository is a template for creating new Next.js applications with the same dependencies and Elastic Beanstalk setup as `template-app`. It includes:
- Next.js 15.3.1, React 18, and Node.js 20.x.
- Elastic Beanstalk configuration for server-side builds on `t2.micro` instances.
- Nginx proxy to port 3000 and health check endpoint (`/api/health`).

## Prerequisites
- Node.js 20.x
- AWS CLI and EB CLI (`pip install awsebcli`)
- Git
- AWS account with Elastic Beanstalk access

## Creating a New Application
1. **Create a New Repository**:
   - Go to `https://github.com/epolga/template-app`.
   - Click **Use this template** > **Create a new repository**.
   - Set:
     - **Owner**: Your GitHub username (e.g., `epolga`).
     - **Repository name**: e.g., `my-new-app`.
     - **Visibility**: Public or Private.
   - Click **Create repository from template**.

2. **Clone the New Repository**:
   ```bash
   git clone https://github.com/epolga/my-new-app
   cd my-new-app
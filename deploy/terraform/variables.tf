# ═══════════════════════════════════════════════════════════════════
# AcquisitionOS — Terraform Variables
# Phase 14.4: Deployment
# ═══════════════════════════════════════════════════════════════════

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (production, staging)"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "acquisitionos"
}

variable "domain" {
  description = "Primary domain for the application"
  type        = string
  default     = "app.acquisitionos.com"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "postgres_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "postgres_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 50
}

variable "postgres_username" {
  description = "RDS master username"
  type        = string
  default     = "postgres"
}

variable "postgres_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
}

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.medium"
}

variable "ecs_cpu" {
  description = "ECS task CPU units"
  type        = number
  default     = 1024
}

variable "ecs_memory" {
  description = "ECS task memory in MB"
  type        = number
  default     = 2048
}

variable "ecs_desired_count" {
  description = "Desired ECS service count"
  type        = number
  default     = 2
}

variable "container_image_frontend" {
  description = "Docker image for frontend"
  type        = string
  default     = "acquisitionos/frontend:latest"
}

variable "container_image_backend" {
  description = "Docker image for backend"
  type        = string
  default     = "acquisitionos/backend:latest"
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default     = {}
}

resource "aws_key_pair" "jenkins_key" {
  key_name   = "jenkins-agent-key"
  public_key = file("jenkins-agent-key.pub")
}

# VPC
resource "aws_default_vpc" "default" {
  tags = {
    Name = "Default VPC"
  }
}

# Security Group
resource "aws_security_group" "jenkins_agent_sg" {
  vpc_id = aws_default_vpc.default.id
  name   = "jenkins_sg"
  tags = {
    Name = "jenkins_sg"
  }

  # Inbound Rules
  ingress {
    protocol    = "tcp"
    from_port   = 80
    to_port     = 80
    cidr_blocks = ["0.0.0.0/0"]
    description = "allowing http request on port 80"
  }

  ingress {
    protocol    = "tcp"
    from_port   = 22
    to_port     = 22
    cidr_blocks = ["0.0.0.0/0"]
    description = "allowing ssh on port 80"
  }

  #Outbound Rules
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]

  }
}

resource "aws_instance" "jenkins_agent_ec2" {
  ami           = var.ami_id
  instance_type = var.instance_type

  tags = {
    Name = var.instance_name
  }
  key_name               = aws_key_pair.jenkins_key.key_name
  vpc_security_group_ids = [aws_security_group.jenkins_agent_sg.id]

  root_block_device {
    volume_size = var.ec2_root_volume_size
  }
}

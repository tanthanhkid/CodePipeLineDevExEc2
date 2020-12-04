// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2')
import iam = require('@aws-cdk/aws-iam')
import s3 = require('@aws-cdk/aws-s3')

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "ArtifactBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY
    })

    const buildRole = new iam.Role(this, "CodeBuildRole", {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    })

    new iam.Policy(this, "CodeBuildRolePolicy", {
      statements: [
        new iam.PolicyStatement({
          actions: [
            "codecommit:GitPull",
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents",
            "s3:GetObject",
            "s3:GetObjectVersion",
            "s3:PutObject",
            "ssm:GetParameters"
          ],
          resources: ["*"]
        }),
      ],
      roles: [
        buildRole
      ]
    })

    const deployRole = new iam.Role(this, "CodeDeployRole", {
      assumedBy: new iam.ServicePrincipal('codedeploy.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSCodeDeployRole"),
      ]
    })

    const vpc = new ec2.Vpc(this, 'VPC');

    const role = new iam.Role(this, "WebAppInstanceRole", {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSCodeDeployReadOnlyAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ReadOnlyAccess")
      ]
    })

    new iam.Policy(this, "DeploymentInstancePolicy", {
      statements: [
        new iam.PolicyStatement({
          actions: [
            "s3:GetObject",
          ],
          resources: ["*"]
        }),
      ],
      roles: [
        role
      ]
    })

    const sg = new ec2.SecurityGroup(this, "WebServersSecurityGroup", {
      vpc: vpc,
    })
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));

    const userData = ec2.UserData.forLinux({ shebang: "#!/bin/bash -ex" });
    userData.addCommands(
      "yum install -y aws-cli",
      "yum install -y git",
      "cd /home/ec2-user/",
      "wget https://aws-codedeploy-" + cdk.Aws.REGION + ".s3.amazonaws.com/latest/codedeploy-agent.noarch.rpm",
      "yum -y install codedeploy-agent.noarch.rpm",
      "service codedeploy-agent start",
    )

    const options = {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      machineImage: new ec2.AmazonLinuxImage(),
      role: role,
      securityGroup: sg,
      userData: userData,
      vpc: vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    };
    const devWeb1 = new ec2.Instance(this, "DevWebApp01", options)
    cdk.Tag.add(devWeb1, "Name", "DevWebApp01")
    cdk.Tag.add(devWeb1, "App", "DemoApp")
    cdk.Tag.add(devWeb1, "Env", "DEV")
    const prdWeb1 = new ec2.Instance(this, "PrdWebApp01", options)
    cdk.Tag.add(prdWeb1, "Name", "PrdWebApp01")
    cdk.Tag.add(prdWeb1, "App", "DemoApp")
    cdk.Tag.add(prdWeb1, "Env", "PRD")

    new cdk.CfnOutput(this, "DevLocation", {
      description: "Development web server location",
      value: "http://" + devWeb1.instancePublicDnsName
    })
    new cdk.CfnOutput(this, "PrdLocation", {
      description: "Production web server location",
      value: "http://" + prdWeb1.instancePublicDnsName
    })

    new cdk.CfnOutput(this, "BucketName", {
      description: "Bucket for storing artifacts",
      value: bucket.bucketName
    })

    new cdk.CfnOutput(this, "BuildRoleArn", {
      description: "Build role ARN",
      value: buildRole.roleArn
    })

    new cdk.CfnOutput(this, "DeployRoleArn", {
      description: "Deploy role ARN",
      value: deployRole.roleArn
    })
  }
}

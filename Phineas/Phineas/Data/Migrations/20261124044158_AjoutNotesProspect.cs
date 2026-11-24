using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Phineas.Data.Migrations
{
    /// <inheritdoc />
    public partial class AjoutNotesProspect : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "NotesProspect",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    ProspectId = table.Column<int>(type: "int", nullable: false),
                    OpportuniteId = table.Column<int>(type: "int", nullable: true),
                    AuteurId = table.Column<string>(type: "varchar(450)", maxLength: 450, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Type = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Contenu = table.Column<string>(type: "varchar(600)", maxLength: 600, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    DateCreation = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    JetonSoumission = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NotesProspect", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NotesProspect_AspNetUsers_AuteurId",
                        column: x => x.AuteurId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_NotesProspect_OpportunitesVente_OpportuniteId",
                        column: x => x.OpportuniteId,
                        principalTable: "OpportunitesVente",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_NotesProspect_Prospects_ProspectId",
                        column: x => x.ProspectId,
                        principalTable: "Prospects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_NotesProspect_AuteurId",
                table: "NotesProspect",
                column: "AuteurId");

            migrationBuilder.CreateIndex(
                name: "IX_NotesProspect_OpportuniteId",
                table: "NotesProspect",
                column: "OpportuniteId");

            migrationBuilder.CreateIndex(
                name: "IX_NotesProspect_ProspectId_JetonSoumission",
                table: "NotesProspect",
                columns: new[] { "ProspectId", "JetonSoumission" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "NotesProspect");
        }
    }
}
